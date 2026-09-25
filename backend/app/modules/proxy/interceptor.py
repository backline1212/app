"""Client-side network interceptor injected into every proxied HTML page.

The HTML rewriter (`rewriter.py`) can only touch `href`/`src`/`action` attributes that
are present in the server-rendered markup. Modern sites do almost everything else from
JavaScript - a login is a `fetch()`/`XMLHttpRequest` to the site's own API, navigation
is `history.pushState`, and neither appears in the initial HTML for a regex to rewrite.
Those requests would otherwise resolve against the proxy page's own origin (Backline's
API) and never reach the reviewed site at all, which is exactly why signing in inside the
canvas failed.

This shim patches `fetch`, `XMLHttpRequest.open`, `navigator.sendBeacon` and
`history.pushState`/`replaceState` so that a URL destined for the reviewed site is
rewritten to `/proxy/{token}/...` before it leaves the page. The session the site then
establishes (cookies, or a bearer token echoed back on later requests) rides through the
proxy the same way a real page-reload form already does (docs/tdr/0026).

Rewritten: URLs on the reviewed site's host (`www.` or not), and URLs on the proxy's own
host - which is where the page's relative URLs and anything built from
`location.origin` land, since as far as the site's scripts can tell that *is* their
origin. Never rewritten: any other origin (a CDN, a third-party SSO), `/proxy/` and
`/widget/` paths, and Backline's own injected review widget, which calls Backline through
the untouched native fetch this exposes as `window.__backlineNativeFetch`
(apps/widget/src/api-client.ts). Element `src`/`href` setters additionally leave
absolute proxy-host URLs alone, since the widget has no such bypass for elements.

What this still cannot do (browser-enforced, not a proxy bug): third-party SSO such as
Google or Microsoft sets `X-Frame-Options`/`frame-ancestors` and refuses to run in any
iframe regardless of proxying; and a request from inside a web worker or a nested
document isn't reached here (a Service Worker is the follow-up for that coverage)."""

import json
from string import Template
from urllib.parse import urlsplit

# `$PREFIX` / `$TARGET_HOST` are filled per share link. Kept as one guarded IIFE so a
# re-injection (e.g. an SPA that swaps document.documentElement) is a no-op, and so a
# throw anywhere inside can never take down the reviewed page's own scripts.
_TEMPLATE = Template(
    """<script data-backline-interceptor="1">
(function(){
  if (window.__backlineProxyInstalled) return;
  window.__backlineProxyInstalled = true;
  var PREFIX = $PREFIX;
  var TARGET_HOST = $TARGET_HOST;
  var LOC = window.location;
  function skip(u){ return !u || /^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(u); }
  function isAbsolute(u){ return /^(https?:)?\\/\\//i.test(u); }
  function bare(h){ return String(h).toLowerCase().replace(/^www\\./, ""); }
  var TARGET_BARE = bare(TARGET_HOST);
  // keepAbsoluteLocal: leave an *absolute* URL on the proxy's own host alone. Element
  // setters pass it, since whatever Backline itself injects into the page could set one;
  // network calls don't, because the widget reaches Backline through the untouched
  // __backlineNativeFetch below - so a site building URLs from location.origin (the
  // proxy host, as far as its scripts can tell) is still routed to the reviewed site.
  function rewrite(url, keepAbsoluteLocal){
    try{
      if (typeof url !== "string") url = String(url);
      if (skip(url)) return url;
      var abs = new URL(url, document.baseURI || LOC.href);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return url;
      var pqf = abs.pathname + abs.search + abs.hash;
      if (pqf.indexOf(PREFIX + "/") === 0 || pqf === PREFIX) return url;
      if (bare(abs.host) === TARGET_BARE) return PREFIX + pqf;
      if (abs.host === LOC.host){
        if (keepAbsoluteLocal && isAbsolute(url)) return url;
        if (pqf.indexOf("/proxy/") === 0 || pqf.indexOf("/widget/") === 0) return url;
        return PREFIX + pqf;
      }
      return url;
    } catch(e){ return url; }
  }
  window.__backlineRewrite = rewrite;
  var _fetch = window.fetch;
  window.__backlineNativeFetch = _fetch;
  if (_fetch){
    window.fetch = function(input, init){
      try{
        if (typeof input === "string" || (typeof URL !== "undefined" && input instanceof URL)){
          input = rewrite(String(input));
        } else if (input && typeof input.url === "string"){
          var nu = rewrite(input.url);
          if (nu !== input.url){ input = new Request(nu, input); }
        }
      } catch(e){}
      return _fetch.call(this, input, init);
    };
  }
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url){
    try{ arguments[1] = rewrite(url); } catch(e){}
    return _open.apply(this, arguments);
  };
  if (navigator.sendBeacon){
    var _beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data){
      try{ url = rewrite(url); } catch(e){}
      return _beacon(url, data);
    };
  }
  function wrapHist(name){
    var orig = history[name];
    if (typeof orig !== "function") return;
    history[name] = function(state, title, url){
      if (url != null){ try{ url = rewrite(url); } catch(e){} }
      return orig.call(this, state, title, url);
    };
  }
  wrapHist("pushState");
  wrapHist("replaceState");
  // Resources a script adds after load (a lazily imported chunk, a stylesheet, an
  // image, an embedded frame) - the browser starts fetching the moment src/href is set,
  // so this has to be the setter itself; an observer would already be too late.
  var URL_PROPS = [
    ["HTMLScriptElement", "src"], ["HTMLLinkElement", "href"], ["HTMLImageElement", "src"],
    ["HTMLIFrameElement", "src"], ["HTMLSourceElement", "src"], ["HTMLMediaElement", "src"],
    ["HTMLVideoElement", "poster"], ["HTMLTrackElement", "src"], ["HTMLEmbedElement", "src"]
  ];
  URL_PROPS.forEach(function(entry){
    try{
      var ctor = window[entry[0]];
      if (!ctor) return;
      var d = Object.getOwnPropertyDescriptor(ctor.prototype, entry[1]);
      if (!d || !d.set || !d.configurable) return;
      Object.defineProperty(ctor.prototype, entry[1], {
        configurable: true, enumerable: d.enumerable, get: d.get,
        set: function(v){ return d.set.call(this, rewrite(v, true)); }
      });
    } catch(e){}
  });
  var RESOURCE_TAGS = {
    SCRIPT:1, LINK:1, IMG:1, IFRAME:1, SOURCE:1, VIDEO:1, AUDIO:1, TRACK:1, EMBED:1
  };
  var URL_ATTRS = { src:1, href:1, poster:1 };
  var _setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value){
    try{
      if (RESOURCE_TAGS[this.tagName] && URL_ATTRS[String(name).toLowerCase()]){
        value = rewrite(value, true);
      }
    } catch(e){}
    return _setAttribute.call(this, name, value);
  };
})();
</script>"""
)


def _js_string(value: str) -> str:
    """A JS string literal that is also safe inside an inline `<script>` block:
    `target_origin` is member-supplied, so `<`/`>`/`&` are escaped to stop a crafted
    value from closing the tag, and U+2028/2029 because they end a JS line."""
    return (
        json.dumps(value)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
    )


def build_interceptor_script(*, proxy_prefix: str, target_origin: str) -> str:
    """`proxy_prefix` is `/proxy/{share_token}`; `target_origin` is the reviewed site's
    scheme+host (e.g. `https://acme.com`). Only the host (with port, if any) is compared
    at runtime, so the scheme difference between an `http`-declared link and an
    `https`-served page never matters."""
    target_host = urlsplit(target_origin).netloc
    return _TEMPLATE.substitute(
        PREFIX=_js_string(proxy_prefix), TARGET_HOST=_js_string(target_host)
    )
