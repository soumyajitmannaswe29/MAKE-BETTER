# MAKE-BETTER
Data model: everything lives in localStorage under one key, structured as { habits: [...], months: { "2026-09": { habitId: { "5": true } } }, theme }. Old months are never touched when you navigate away, so history persists indefinitely.
"Today" vs "This month": the Today stat/donut always reflects the real current date, even while you're browsing a past or future month. The month donut, weekly bars, and per-habit progress all reflect whichever month you're viewing.
Streak: computed by walking backward day-by-day from today across month boundaries per habit, so it survives month changes correctly; the top stat shows your best current streak across all habits.
Future days are rendered muted and non-interactive, and are excluded from every percentage calculation.
Sticky layout: the habit-name column stays pinned while scrolling horizontally, and the date header stays pinned while scrolling vertically (the tracker has its own internal scroll area, capped at 58% viewport height).
No save button — every click writes to storage immediately, with the small "Saved ✓" indicator pulsing as confirmation.
