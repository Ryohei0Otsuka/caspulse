# CASPULSE Metrics Notes

CASPULSE separates **activity** from **momentum**.

## Momentum

Momentum answers: **"Is the comment flow accelerating relative to its recent baseline?"**

Every status sample:

1. Count comments in the latest 15 seconds.
2. Count comments in the 60 seconds immediately before that window.
3. Divide the previous 60-second count by 4 to create a comparable 15-second baseline.
4. Compare the latest 15 seconds with that baseline.

```text
momentum = ((recent15 - baseline15) / baseline15) * 100
```

When there is effectively no baseline but comments appear, CASPULSE reports a positive burst. Display is capped to `-100 ... +999`.

## Activity score

Activity answers: **"How much observable activity is present right now?"**

Current v0.1 heuristic:

```text
commentScore  = min(45, commentsPerMinute * 1.8)
uniqueScore   = min(25, uniqueCommenters * 3)
viewerScore   = min(20, max(0, viewerDelta) * 2.5)
momentumScore = min(10, max(0, momentum) / 40)

activity = clamp(round(sum), 0, 100)
```

The weights are intentionally transparent and expected to change after real data is collected.

## What these metrics do not prove

They do not prove why a stream grew or why comments accelerated. External recommendation surfaces, links from other services, another broadcaster ending a stream, raids/collaboration effects, and many other factors are outside CASPULSE's observation window.

The UI therefore uses language like `RISING`, `BURST`, `viewer +N`, and `comments/min` rather than claiming that a specific topic *caused* the change.
