# Tattoo times file (format "tattoo-timer-1")
File name `tattoo-times-YYYY-MM-DD.json`. UTF-8 JSON:
{ "format": "tattoo-timer-1", "exportedAt": ISO, "entries": [
  { "id": "uuid", "code": "1BF26", "label": "optional text", "startedAt": ISO, "endedAt": ISO, "activeMs": 5400000,
    "segments": [ { "s": ISO, "e": ISO } ] } ] }
`code` is the flash code as typed (the reader normalizes: ignore case, spaces, dashes). `activeMs` excludes paused time.
Contains no client name, license, contact or other personal data on purpose.
