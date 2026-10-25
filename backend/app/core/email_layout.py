"""One consistent shell for every email Backline sends.

Callers write a short HTML fragment (paragraphs, a list, links); `send_email` wraps it
here. Email clients drop or rewrite <style> blocks inconsistently, so the shell is
table-based with inline styles only, and a plain-text part is derived from the fragment.
"""

import re
from html import escape, unescape

_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
_INK = "#16201b"
_MUTED = "#5f6b65"
_PAGE = "#f4f7f5"
_LINE = "#dfe5e1"


def is_document(html: str) -> bool:
    return re.match(r"\s*(<!doctype|<html)", html, re.IGNORECASE) is not None


def plain_text(html: str) -> str:
    """Readable text for the text/plain part and the inbox preview line."""
    text = re.sub(
        r'(?is)<a\s[^>]*href="([^"]*)"[^>]*>(.*?)</a>',
        lambda m: f"{m.group(2)} ({m.group(1)})",
        html,
    )
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(p|blockquote|h[1-6]|ul|ol|div)>", "\n\n", text)
    text = re.sub(r"(?i)<li[^>]*>", "- ", text)
    text = re.sub(r"(?i)</li>", "\n", text)
    text = unescape(re.sub(r"<[^>]+>", "", text))
    lines = [" ".join(line.split()) for line in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def render_email(
    *,
    subject: str,
    content_html: str,
    brand: str | None = None,
    unsubscribe_url: str | None = None,
) -> str:
    """Wrap a fragment in the shell. `brand` names the sender for client-facing emails
    (an agency's own name); without it the email is from Backline. `unsubscribe_url`
    adds an Unsubscribe link under the card."""
    if is_document(content_html):
        return content_html
    sender = escape(brand or "Backline")
    preheader = escape(plain_text(content_html).replace("\n", " ")[:140])
    footer_parts = [] if brand else ["Backline &middot; client feedback, anchored to the work"]
    if unsubscribe_url:
        footer_parts.append(
            f'<a href="{escape(unsubscribe_url, quote=True)}" style="color:{_MUTED};">'
            "Unsubscribe</a>"
        )
    footer = (
        f'<p style="margin:16px 0 0;font:12px/1.5 {_FONT};color:{_MUTED};">'
        f"{' &middot; '.join(footer_parts)}</p>"
        if footer_parts
        else ""
    )
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="color-scheme" content="light only">'
        f"<title>{escape(subject)}</title></head>"
        f'<body style="margin:0;padding:0;background:{_PAGE};">'
        '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">'
        f"{preheader}</div>"
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="background:{_PAGE};"><tr><td align="center" style="padding:32px 16px;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="max-width:560px;background:#ffffff;border:1px solid {_LINE};border-radius:8px;">'
        f'<tr><td style="padding:24px 32px 0;font:700 16px/1.3 {_FONT};color:{_INK};">'
        f"{sender}</td></tr>"
        f'<tr><td style="padding:8px 32px 28px;font:15px/1.6 {_FONT};color:{_INK};">'
        f"{content_html}</td></tr></table>{footer}</td></tr></table></body></html>"
    )
