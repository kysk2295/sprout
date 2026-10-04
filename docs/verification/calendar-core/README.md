# Calendar core comparison — 2026-10-04

TickTick macOS was operated directly with native CUA. User scope: no split view; prioritize calendar creation and view-specific interactions.

| Action | Observed reference | Implementation correction |
|---|---|---|
| Day / week empty time click | Point time, no start / duration; default on-time reminder | Null start, selected due time; 16px selection |
| Day / week time drag | Range includes final quarter-hour slot (11:00 through 12:00 produces 12:15 end) | Inclusive 15-minute end; direction-independent |
| Month empty date click | Date-only header, no time/reminder | All-day draft, cell-edge anchor |
| Month empty date drag | Two repeated gestures opened no editor | Ignore drag instead of inventing a date range |
| Creation header | Editable date button; nested date/duration editor | DatePicker with draft schedule |
| Creation body | Title and description; list and priority | Save description with schedule in one transaction |
| Popup anchor | Week beside selected column; day centered within wide day column | Anchor to selection rather than release pointer |

Images: ticktick-month-create.jpg, ticktick-day-create.jpg, ticktick-day-range.jpg, ticktick-week-range.jpg.

Existing week audit task: a single click did not open a popup; double-click opened a separate detail window. That separate-window behavior has not been implemented in this creation-focused pass. Full parity is not claimed.

Verification results are appended after execution.

## Executed verification

- `npm run typecheck`, `npm run test:desktop`, `npm test`, `npm run build`: passed. Data tests cover point/range selection, reverse selection, late-night point, description persistence and reminder-failure transaction rollback.
- Browser preview: day/week point creation; week description saved and reopened; nested picker Escape preserves parent; month date changed Oct 8 → Oct 9 and outside-click saved; day Enter saved.
- Native Electron: View → Reload removed persisted split layout. Day drag 04:00 → 05:00 saved as 04:00–05:15. Week drag 05:00 → 06:00 displayed 05:00–06:15 and Escape cancelled. Month drag opened no popup, subsequent single click opened date-only popup anchored to the cell.
- Native screenshots: sprout-week-range.jpg, sprout-month-create.jpg. Native audit task `QA 일 드래그 범위` remains for inspection.
