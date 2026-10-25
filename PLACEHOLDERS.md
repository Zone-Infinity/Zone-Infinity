# Placeholders

Use these in `card.txt` or `lattice.txt`. Each one is replaced when the images are drawn, which happens every night and after every edit, and it shows in aqua because it changes.

| Placeholder | Becomes | Example |
|---|---|---|
| `{uptime}` | Time since my first contribution | 6 years, 1 month, 13 days |
| `{since}` | Month of my first contribution | Sep 2020 |
| `{repos}` | My public, non-fork repos | 38 |
| `{stars}` | Stars across those repos | 12 |
| `{followers}` | Followers | 68 |
| `{contributed}` | Other repos I've committed to or opened PRs in | 20 |
| `{prs}` | My merged pull requests | 9 |
| `{commits}` | All commit contributions, every year (private ones as counts only, with `PROFILE_TOKEN`) | 1,927 |
| `{year}` | Contributions in the last 12 months | 394 |
| `{active_days}` | Days with at least one contribution, ever | 417 |
| `{streak}` | Current daily streak (alive if yesterday counted) | 1 day |
| `{longest}` | Longest daily streak, ever | 16 days |
| `{best_day}` | Most contributions in one day, and when | 48 on 23 Jun 2026 |
| `{busiest}` | Month of the busiest week in the last 12 months | Nov 2025 |
| `{top_language}` | Most common primary language across my repos | Java |
| `{updated}` | When the images were last drawn | 25 Oct 2026 |

Run `node scripts/build.mjs --placeholders` to print the current value of each. An unknown placeholder fails the build with this list, so a typo never reaches the profile.
