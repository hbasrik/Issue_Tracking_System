# Analysis layout — chart type choices

| Chart | Type | Why |
|-------|------|-----|
| Stage performance | Stacked vertical bar | Completed vs remaining by stage — composition + magnitude |
| Status distribution | Donut + side table | Part-of-whole mix; labels beside ring (no overflow) |
| Severity mix | Donut + side table | Same pattern for 3-way severity |
| Station MTTR | Vertical bar | Compare hours across stations |
| Open by station | Horizontal bar | Ranked stations, long names readable |
| Top 5 vehicles | Compact table | Exact VIN + counts + severity pills |
| Daily open/closed | Dual area | Time series for stock vs closures |
| Open defect age | Vertical bar | Bucketed ages |
| Top issue types | Horizontal bar | Ranked categorical counts |
| Done vs ongoing | Progress split bars | Two-way share without another donut |
| Conditional mix | Progress split bars | Same |
| EOL funnel | Progress bars | Stage snapshot shares |
| Vehicle × severity | Stacked vertical bar + table | Multi-series per VIN |

KPI strip (5): Production, Open, Critical, Closed, EOL completion — ops + quality pulse; MTTR/FPY shown under MTTR chart; shipped/delivered live in other pages / funnel.
