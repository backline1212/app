# TDR-0231: Browser jobs get their own slots; chat webhook URLs are encrypted

Date: 2026-11-07. Source: open items left by TDR-0228.

## Browser job slots

`max_jobs = 3` existed to keep headless-browser renders from exhausting worker memory,
but it limited every job: three slow renders held up emails, digests, integration posts
and the worker heartbeat (which `/health/worker` reads). Now:

- Renders and preview captures take one of `BROWSER_SLOTS = 2` Redis slots
  (`worker:browser-slot:N`, 330 s expiry so a killed worker frees its slot). A browser
  job that finds no free slot is deferred 15 s (`arq.Retry`) instead of holding a worker
  slot; those two jobs allow 40 tries.
- `max_jobs` is 10.

## Chat webhook URLs

A Slack/Discord/Teams incoming-webhook URL is the integration's credential, but it was
stored in plain text while every other credential is Fernet-encrypted. New integrations
store `webhook_url_encrypted`; `core.encryption.chat_webhook_url` reads either form, so
existing rows keep working. `scripts/migrate_encrypt_chat_webhooks.py` (dry run by
default, `--apply` to write) moves existing plain URLs into the encrypted field.
