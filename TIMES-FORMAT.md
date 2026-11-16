# Tattoo times file (format "tattoo-timer-1")
File name `tattoo-times-YYYY-MM-DD.json`. UTF-8 JSON:
{ "format": "tattoo-timer-1", "exportedAt": ISO, "entries": [
  { "id": "uuid", "code": "1BF26", "label": "optional text", "startedAt": ISO, "endedAt": ISO, "activeMs": 5400000,
    "segments": [ { "s": ISO, "e": ISO } ], "revision": 0 } ] }
`code` is the flash code as typed (the reader normalizes: ignore case, spaces, dashes). `activeMs` excludes paused time.
Contains no client name, license, contact or other personal data on purpose.

`revision` (integer, default 0) goes up each time a saved session is continued and saved again. The same `id` with a higher `revision` REPLACES the earlier time (it is the new total, not an addition).
