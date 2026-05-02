# Production Route Thrash Summary

## Run
- Started: 2026-04-30T14:27:13.995Z
- Finished: 2026-04-30T14:27:35.549Z
- Duration ms: 21554
- Base URL: https://camp-site.co.uk
- Users CSV: scripts/ussu-provision-output/ussu-password-import.csv
- Seed: 1590257923
- Tabs per user: 3
- Tab start jitter ms: 250
- Selected users: james.hann@camp-site.co.uk, lindsay.horler@camp-site.co.uk, rachael.wall@camp-site.co.uk, olga.saskova@camp-site.co.uk, sarthak.peshin@camp-site.co.uk, aarun.palmer@camp-site.co.uk
- Selected routes: tenant_dashboard, profile, hr_home, hr_records, hr_performance, hr_onboarding, hr_org_chart, hr_hiring, hr_hiring_requests, hr_hiring_jobs, hr_hiring_applications, hr_hiring_interviews, hr_hiring_templates, hr_metric_alerts

## Pages
- Count: 72
- Avg / p95 ms: 936 / 3092
- Slow >= 1200ms: 19
- Timeouts: 0
- Login redirects: 0
- Status dist: 200:72

### Slowest page requests
- lindsay.horler@camp-site.co.uk profile -> 200 in 3653ms (https://university-of-sussex-student-union.camp-site.co.uk/profile) [lhr1::fra1::9tcw8-1777559237700-35042723563a]
- rachael.wall@camp-site.co.uk hr_performance -> 200 in 3449ms (https://university-of-sussex-student-union.camp-site.co.uk/hr/performance) [lhr1::fra1::wffb8-1777559237739-52593d3044f2]
- lindsay.horler@camp-site.co.uk hr_hiring_interviews -> 200 in 3361ms (https://university-of-sussex-student-union.camp-site.co.uk/hr/hiring/interviews) [lhr1::fra1::r8ssm-1777559237738-ce9e2182094c]
- rachael.wall@camp-site.co.uk hr_home -> 200 in 3092ms (https://university-of-sussex-student-union.camp-site.co.uk/hr) [lhr1::fra1::nfnvw-1777559237711-2838c761ee28]
- rachael.wall@camp-site.co.uk hr_hiring_jobs -> 200 in 2721ms (https://university-of-sussex-student-union.camp-site.co.uk/hr/hiring/jobs) [lhr1::fra1::wgwwl-1777559237710-4832a065d7e3]
- james.hann@camp-site.co.uk hr_org_chart -> 200 in 2665ms (https://university-of-sussex-student-union.camp-site.co.uk/hr/org-chart) [lhr1::fra1::jhjql-1777559237714-e388d93ae283]
- olga.saskova@camp-site.co.uk hr_hiring_templates -> 200 in 2469ms (https://university-of-sussex-student-union.camp-site.co.uk/dashboard) [lhr1::srdvn-1777559251835-3fd288d20f1e, lhr1::bbk56-1777559253434-074efb5d96f6, lhr1::fra1::z29kd-1777559253569-58e89aadb072, lhr1::fra1::5mxs7-1777559253959-18437664018c]
- james.hann@camp-site.co.uk hr_hiring_templates -> 200 in 2326ms (https://university-of-sussex-student-union.camp-site.co.uk/hr/hiring/templates) [lhr1::fra1::hfnrm-1777559237710-09343ecfbcc4]
- lindsay.horler@camp-site.co.uk hr_metric_alerts -> 200 in 2142ms (https://university-of-sussex-student-union.camp-site.co.uk/hr/hr-metric-alerts) [lhr1::fra1::jk48t-1777559237738-9d2ee48cf0bd]
- james.hann@camp-site.co.uk hr_metric_alerts -> 200 in 2011ms (https://university-of-sussex-student-union.camp-site.co.uk/hr/hr-metric-alerts) [lhr1::fra1::6ghws-1777559237700-a5865e4078c2]
- aarun.palmer@camp-site.co.uk hr_home -> 200 in 1796ms (https://university-of-sussex-student-union.camp-site.co.uk/hr) [lhr1::fra1::9px7g-1777559247431-98d7ba60308a]
- olga.saskova@camp-site.co.uk hr_hiring_requests -> 200 in 1776ms (https://university-of-sussex-student-union.camp-site.co.uk/hr/hiring/requests) [lhr1::fra1::c94kj-1777559247967-b749f5773740]

### Route aggregates
- profile: count=3 avg=1592ms p95=3653ms max=3653ms slow=1 non200=0 status=200:3
- hr_performance: count=8 avg=1018ms p95=3449ms max=3449ms slow=3 non200=0 status=200:8
- hr_hiring_interviews: count=5 avg=1206ms p95=3361ms max=3361ms slow=2 non200=0 status=200:5
- hr_home: count=4 avg=1733ms p95=3092ms max=3092ms slow=3 non200=0 status=200:4
- hr_hiring_jobs: count=4 avg=832ms p95=2721ms max=2721ms slow=1 non200=0 status=200:4
- hr_org_chart: count=7 avg=908ms p95=2665ms max=2665ms slow=2 non200=0 status=200:7
- hr_hiring_templates: count=6 avg=1073ms p95=2469ms max=2469ms slow=2 non200=0 status=200:6
- hr_metric_alerts: count=7 avg=888ms p95=2142ms max=2142ms slow=2 non200=0 status=200:7
- hr_hiring_requests: count=5 avg=786ms p95=1776ms max=1776ms slow=1 non200=0 status=200:5
- hr_onboarding: count=1 avg=1743ms p95=1743ms max=1743ms slow=1 non200=0 status=200:1
- hr_records: count=7 avg=858ms p95=1669ms max=1669ms slow=1 non200=0 status=200:7
- tenant_dashboard: count=2 avg=718ms p95=1176ms max=1176ms slow=0 non200=0 status=200:2
- hr_hiring: count=7 avg=443ms p95=813ms max=813ms slow=0 non200=0 status=200:7
- hr_hiring_applications: count=6 avg=488ms p95=745ms max=745ms slow=0 non200=0 status=200:6

## Shell
- Count: 72
- Avg ms: 507
- Degraded: 0
- Timeouts: 0
- Slow page + degraded shell pairings: 0
- Status dist: 200:72
- Cache status dist: hit:42, miss:22, coalesced:8
- Cache mode dist: single-rpc:72
- Auth validation dist: cookie_session:72
- Guardrail reasons: none

### Slowest shell snapshots
- james.hann@camp-site.co.uk shell 200 in 2860ms degraded=false cache=miss/single-rpc vercel=lhr1::fra1::lbkx8-1777559239827-181ef8e0862c
- lindsay.horler@camp-site.co.uk shell 200 in 2713ms degraded=false cache=miss/single-rpc vercel=lhr1::fra1::r88xh-1777559239640-65b284d4e971
- james.hann@camp-site.co.uk shell 200 in 2292ms degraded=false cache=miss/single-rpc vercel=lhr1::fra1::w5p5s-1777559239832-37415dbad2f4
- james.hann@camp-site.co.uk shell 200 in 2139ms degraded=false cache=miss/single-rpc vercel=lhr1::fra1::c94kj-1777559239886-be53e1a1149f
- sarthak.peshin@camp-site.co.uk shell 200 in 1950ms degraded=false cache=hit/single-rpc vercel=lhr1::fra1::x8cwn-1777559251668-c7fbde39e9b6
- rachael.wall@camp-site.co.uk shell 200 in 1894ms degraded=false cache=coalesced/single-rpc vercel=lhr1::fra1::w6zm2-1777559240232-f067b8987ca1
- rachael.wall@camp-site.co.uk shell 200 in 1649ms degraded=false cache=miss/single-rpc vercel=lhr1::fra1::6rddg-1777559240139-9cf4e80df400
- rachael.wall@camp-site.co.uk shell 200 in 1126ms degraded=false cache=coalesced/single-rpc vercel=lhr1::fra1::wffb8-1777559240659-32dd6a9e196e
- james.hann@camp-site.co.uk shell 200 in 1103ms degraded=false cache=hit/single-rpc vercel=lhr1::fra1::nfnvw-1777559243667-dc6ffe6336f4
- lindsay.horler@camp-site.co.uk shell 200 in 997ms degraded=false cache=miss/single-rpc vercel=lhr1::fra1::p5n5w-1777559240668-b4890597b9a7
- sarthak.peshin@camp-site.co.uk shell 200 in 967ms degraded=false cache=miss/single-rpc vercel=lhr1::fra1::nfnvw-1777559251663-d839b4225727
- lindsay.horler@camp-site.co.uk shell 200 in 823ms degraded=false cache=coalesced/single-rpc vercel=lhr1::fra1::j7ltb-1777559240856-97ec781da031

## Failure Onset
- First slow page: +0ms james.hann@camp-site.co.uk tab=3 route=hr_metric_alerts status=200 ms=2011
- First degraded shell: none
- First page timeout: none
- First shell timeout: none

### Timeline buckets (10s)
- 0-10s: pages=36 slowPages=12 pageTimeouts=0 degradedShells=0 shellTimeouts=0
- 10-20s: pages=36 slowPages=7 pageTimeouts=0 degradedShells=0 shellTimeouts=0
