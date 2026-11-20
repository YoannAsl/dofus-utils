# 8. Input behaviour

Status: accepted

## Decision

- A saved HDV price is written when its field loses focus or on Enter, not on every keystroke, so a half-typed value is never stored or wiped.
- The market search URL follows the search box after a short pause, so typing does not flood DofusDB.
- In the shatter log, Enter on the last rune quantity adds a row, so a whole drop can be typed from the keyboard.
- Equipment search keeps focus in its input while the result list opens, and clicks on the input do not close the list.
