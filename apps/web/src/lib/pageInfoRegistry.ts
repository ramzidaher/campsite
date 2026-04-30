export type PageInfoLink = {
  href: string;
  label: string;
};

export type PageInfoMatch =
  | { kind: 'exact'; path: string }
  | { kind: 'prefix'; path: string }
  | { kind: 'template'; path: string };

export type PageInfoEntry = {
  id: string;
  match: PageInfoMatch;
  title: string;
  summary: string;
  highlights?: string[];
  links?: PageInfoLink[];
};

const PAGE_INFO_ENTRIES: PageInfoEntry[] = [
  {
    id: 'admin-integrations',
    match: { kind: 'exact', path: '/admin/integrations' },
    title: 'What this page is for',
    summary:
      'This is the organisation-level overview for external tools that connect into Campsite. It helps admins understand what each integration powers and where to go next for setup.',
    highlights: [
      'Google Sheets is used for rota imports, so this is where admins can jump into the spreadsheet import flow.',
      'Google Calendar is used for interview scheduling, and each panel member connects their own Google account in Settings -> Integrations.',
      'Keeping setup here in admin helps the whole organisation use the same workflows and avoids one-off personal configurations.',
    ],
    links: [
      { href: '/admin/rota-import', label: 'Open Sheets import' },
      { href: '/admin/interviews', label: 'Open interview schedule' },
    ],
  },
  {
    id: 'admin-notifications',
    match: { kind: 'exact', path: '/admin/notifications' },
    title: 'How notification defaults work',
    summary:
      'This page controls the starting notification setting for new members in your organisation. It is there to help admins decide whether new profiles should begin with in-app notifications enabled by default.',
    highlights: [
      'This applies to new members joining after the setting is saved, not to every existing person in the organisation.',
      'Individual users can still change their own notification preferences later in Settings, so this sets the starting point rather than locking everyone into one rule.',
      'Use this when you want a consistent onboarding experience for broadcasts, updates, and other core in-app alerts.',
    ],
    links: [
      { href: '/settings', label: 'Open personal settings' },
      { href: '/admin/settings', label: 'Open org settings' },
    ],
  },
  {
    id: 'admin-privacy',
    match: { kind: 'exact', path: '/admin/privacy' },
    title: 'What this privacy center is for',
    summary:
      'This page gives admins and legal reviewers one place to manage retention rules and handle GDPR right-to-erasure requests. It is used to document how long data should be kept and to review deletion or anonymisation workflows before anything is executed.',
    highlights: [
      'Retention policies define the expected lifespan, legal basis, and final action for a type of data such as HR documents or application records.',
      'Erasure requests move through review stages so the organisation can check legal obligations before approving or executing anything.',
      'Some records may still need to be retained for payroll, tax, safeguarding, or other compliance reasons even when an erasure request is raised.',
    ],
    links: [
      { href: '/admin/roles', label: 'Open roles and permissions' },
      { href: '/privacy', label: 'Open privacy policy' },
    ],
  },
  {
    id: 'admin-settings',
    match: { kind: 'exact', path: '/admin/settings' },
    title: 'How organisation settings work',
    summary:
      'This page is the control center for organisation-wide defaults and identity settings in Campsite. It is where admins manage how the workspace looks, which shared defaults new members inherit, and a few high-impact account-level actions.',
    highlights: [
      'Branding lets you manage the organisation name, logo, colour palette, and the way celebration themes interact with your brand.',
      'General settings cover shared defaults such as timezone and the starting notification preference for new members.',
      'Celebrations control optional seasonal or organisation-specific themes, while the danger zone handles exports and deactivation requests that affect the whole workspace.',
    ],
    links: [
      { href: '/admin/notifications', label: 'Open notification defaults' },
      { href: '/admin/privacy', label: 'Open privacy center' },
    ],
  },
  {
    id: 'admin-scan-logs',
    match: { kind: 'exact', path: '/admin/scan-logs' },
    title: 'What these scan logs are for',
    summary:
      'This page is the audit trail for staff discount QR verification activity. It helps admins review who scanned which member card, when it happened, and whether the token check passed or failed.',
    highlights: [
      'Use this screen to investigate unusual scanner activity, confirm a recent verification happened, or spot repeated invalid scans.',
      'The filters help narrow the view by result and time period so recent issues are easier to find.',
      'This page is for monitoring and audit history, while the discount setup itself is managed separately under admin discount rules.',
    ],
    links: [
      { href: '/admin/discount', label: 'Open discount rules' },
      { href: '/discount/scan', label: 'Open staff scanner' },
    ],
  },
  {
    id: 'admin-generic',
    match: { kind: 'prefix', path: '/admin' },
    title: 'How the admin area works',
    summary:
      'This part of Campsite is for organisation-level setup, governance, and operational controls. Admin pages are used to manage shared rules, defaults, workflows, and records that affect more than one member.',
    highlights: [
      'Use the admin area when you are changing organisation-wide behaviour rather than just your own personal settings.',
      'Different admin pages cover different responsibilities such as members, roles, settings, recruitment, compliance, and reporting, so access is permission-based.',
      'If a page already has a more specific help entry, that page-level guidance will appear instead of this general admin overview.',
    ],
    links: [
      { href: '/admin', label: 'Open admin overview' },
      { href: '/admin/settings', label: 'Open admin settings' },
    ],
  },
  {
    id: 'finance-overview',
    match: { kind: 'exact', path: '/finance' },
    title: 'What the finance workspace is for',
    summary:
      'This page is the main payroll and finance operations workspace in Campsite. It brings together wagesheet review, time data, attendance effects, leave impacts, and payroll controls so finance users can work across the full pay workflow.',
    highlights: [
      'Use it when you need the broad payroll view rather than one narrow step such as timesheet approval alone.',
      'It acts as the central place to review payroll-ready data before or during finance processing.',
    ],
    links: [
      { href: '/finance/timesheets', label: 'Open timesheet review' },
      { href: '/finance/wagesheets', label: 'Open wagesheets' },
    ],
  },
  {
    id: 'finance-timesheets',
    match: { kind: 'exact', path: '/finance/timesheets' },
    title: 'What timesheet review is for',
    summary:
      'This page is for reviewing submitted weekly timesheets. It helps authorised users approve, edit, or reject weeks before those hours are turned into wagesheet lines for payroll.',
    highlights: [
      'Use it when you are validating worked time before payroll output is created.',
      'Approved timesheets feed directly into the wagesheet workflow.',
    ],
    links: [
      { href: '/finance/wagesheets', label: 'Open wagesheets' },
      { href: '/finance', label: 'Open finance workspace' },
    ],
  },
  {
    id: 'finance-wagesheets',
    match: { kind: 'exact', path: '/finance/wagesheets' },
    title: 'What wagesheets are for',
    summary:
      'This page shows the payroll lines generated from approved time and related pay inputs. It helps finance users review the payroll-ready output after timesheet approval has already happened.',
    highlights: [
      'Use it for payroll line review and export rather than raw timesheet approval.',
      'This is the downstream view after weekly time has been accepted.',
    ],
    links: [
      { href: '/finance/timesheets', label: 'Open timesheet review' },
      { href: '/finance', label: 'Open finance workspace' },
    ],
  },
  {
    id: 'finance-attendance-settings',
    match: { kind: 'exact', path: '/finance/attendance-settings' },
    title: 'What attendance settings are for',
    summary:
      'This page configures attendance and work-site rules that affect clocking and payroll workflows. It is where geofences and weekly timesheet rejection policies are managed.',
    highlights: [
      'Use it when attendance policy or clock-in site rules need changing.',
      'These settings shape how time is captured and validated before finance review.',
    ],
    links: [
      { href: '/finance/timesheets', label: 'Open timesheet review' },
      { href: '/finance', label: 'Open finance workspace' },
    ],
  },
  {
    id: 'hr-overview',
    match: { kind: 'exact', path: '/hr' },
    title: 'What the people overview is for',
    summary:
      'This is the HR landing page for people operations. It gives HR leads a quick view of hiring, records, alerts, and onboarding so they can jump into the right workflow fast.',
    highlights: [
      'Use it as a launchpad and snapshot rather than a detailed editing screen.',
      'The cards here are shortcuts into deeper HR tools such as hiring, records, alerts, and onboarding.',
    ],
    links: [
      { href: '/hr/records', label: 'Open employee records' },
      { href: '/hr/hiring/requests', label: 'Open hiring requests' },
    ],
  },
  {
    id: 'hr-records',
    match: { kind: 'exact', path: '/hr/records' },
    title: 'What employee records are for',
    summary:
      'This page is the directory of employee HR records for your organisation. Use it to find a person quickly and open their full HR file for day-to-day people management work.',
    highlights: [
      'This is the starting point for record lookup, not the record itself.',
      'Open an individual profile when you need the detailed HR file for one employee.',
    ],
    links: [
      { href: '/hr', label: 'Open people overview' },
      { href: '/hr/org-chart', label: 'Open org chart' },
    ],
  },
  {
    id: 'hr-record-detail',
    match: { kind: 'template', path: '/hr/records/[userId]' },
    title: 'What this employee record is for',
    summary:
      'This page is the HR file for one person. It brings together employment details, documents, compensation-related fields, absence context, privacy flags, and other recordkeeping information used for that employee.',
    highlights: [
      'Use this when you are working on one specific employee case rather than browsing the wider directory.',
      'Changes here affect the individual record, so it is best suited to detailed HR administration and audits.',
    ],
    links: [
      { href: '/hr/records', label: 'Back to employee records' },
      { href: '/hr/absence-reporting', label: 'Open absence reporting' },
    ],
  },
  {
    id: 'hr-org-chart',
    match: { kind: 'exact', path: '/hr/org-chart' },
    title: 'What the org chart is for',
    summary:
      'This page shows the reporting structure of the organisation. It helps HR and leaders understand team relationships, manager chains, and how departments connect across the org.',
    highlights: [
      'Use it to sense-check reporting lines and organisational structure.',
      'It is especially useful for restructures, onboarding context, and manager visibility.',
    ],
    links: [
      { href: '/hr/records', label: 'Open employee records' },
      { href: '/hr', label: 'Open people overview' },
    ],
  },
  {
    id: 'hr-one-on-ones',
    match: { kind: 'exact', path: '/hr/one-on-ones' },
    title: 'What 1:1 check-ins are for',
    summary:
      'This page is for structured one-to-one check-ins between managers and employees. It helps HR teams monitor that check-ins are happening and gives managers a consistent space to track them.',
    highlights: [
      'Use this area for recurring conversations and follow-up, not formal review cycles.',
      'It supports ongoing manager-employee contact between larger performance milestones.',
    ],
    links: [
      { href: '/hr/performance', label: 'Open performance reviews' },
      { href: '/hr/records', label: 'Open employee records' },
    ],
  },
  {
    id: 'hr-absence-reporting',
    match: { kind: 'exact', path: '/hr/absence-reporting' },
    title: 'What absence reporting is for',
    summary:
      'This page helps HR teams review absence patterns across the organisation. It is used to spot trends, investigate repeated sickness or absence issues, and support follow-up action where needed.',
    highlights: [
      'Use it for pattern monitoring and case review rather than simple leave booking.',
      'It is especially helpful when you need to compare absence history across people or teams.',
    ],
    links: [
      { href: '/hr/leave', label: 'Open leave management' },
      { href: '/hr/hr-metric-alerts', label: 'Open HR metric alerts' },
    ],
  },
  {
    id: 'hr-hr-metric-alerts',
    match: { kind: 'exact', path: '/hr/hr-metric-alerts' },
    title: 'What HR metric alerts are for',
    summary:
      'This page configures the thresholds and settings behind HR alerts. It is where teams tune metrics such as Bradford-style triggers, working-hours checks, and diversity evaluation windows.',
    highlights: [
      'Use it to control when HR should be alerted, not to review the alerts themselves.',
      'These settings shape how sensitive the system is to absence, hours, and diversity-related signals.',
    ],
    links: [
      { href: '/hr/absence-reporting', label: 'Open absence reporting' },
      { href: '/hr', label: 'Open people overview' },
    ],
  },
  {
    id: 'hr-performance',
    match: { kind: 'exact', path: '/hr/performance' },
    title: 'What performance reviews are for',
    summary:
      'This page manages performance review cycles across the organisation. It helps HR launch, monitor, and revisit review programmes rather than just viewing one employee conversation at a time.',
    highlights: [
      'Use it to manage the review process across many people.',
      'Open a specific cycle when you need the detailed status for one review programme.',
    ],
    links: [
      { href: '/hr/one-on-ones', label: 'Open 1:1 check-ins' },
      { href: '/hr/records', label: 'Open employee records' },
    ],
  },
  {
    id: 'hr-performance-cycle',
    match: { kind: 'template', path: '/hr/performance/[cycleId]' },
    title: 'What this review cycle is for',
    summary:
      'This page is the detailed workspace for one performance review cycle. It helps HR track participation, progress, and outcomes for that specific review programme.',
    highlights: [
      'Use it when you are actively managing one cycle rather than the overall performance setup.',
      'It is where the operational detail of a single review programme lives.',
    ],
    links: [
      { href: '/hr/performance', label: 'Back to performance reviews' },
      { href: '/hr/one-on-ones', label: 'Open 1:1 check-ins' },
    ],
  },
  {
    id: 'hr-onboarding',
    match: { kind: 'exact', path: '/hr/onboarding' },
    title: 'What onboarding is for',
    summary:
      'This page manages onboarding runs and templates for new starters. It helps HR coordinate the tasks, progress, and ownership needed to bring someone into the organisation smoothly.',
    highlights: [
      'Use it to create or monitor onboarding runs across the organisation.',
      'Open a specific run when you need the detailed checklist and progress for one starter.',
    ],
    links: [
      { href: '/hr/records', label: 'Open employee records' },
      { href: '/hr', label: 'Open people overview' },
    ],
  },
  {
    id: 'hr-onboarding-run',
    match: { kind: 'template', path: '/hr/onboarding/[runId]' },
    title: 'What this onboarding run is for',
    summary:
      'This page is the detailed onboarding workspace for one specific run. It helps HR and managers track tasks, owners, and progress for a particular new joiner or onboarding process.',
    highlights: [
      'Use it when you need to manage one onboarding case in detail.',
      'This is the execution view for a run, not the overview of all onboarding activity.',
    ],
    links: [
      { href: '/hr/onboarding', label: 'Back to onboarding' },
      { href: '/hr/records', label: 'Open employee records' },
    ],
  },
  {
    id: 'hr-leave',
    match: { kind: 'exact', path: '/hr/leave' },
    title: 'What leave management is for',
    summary:
      'This page is the HR workspace for time off and leave management. It helps authorised users review requests, balances, policies, and absence-related decisions at an organisational level.',
    highlights: [
      'Use it when you are managing leave across teams rather than just viewing your own balance.',
      'It complements absence reporting by covering request handling and leave operations.',
    ],
    links: [
      { href: '/hr/absence-reporting', label: 'Open absence reporting' },
      { href: '/hr', label: 'Open people overview' },
    ],
  },
  {
    id: 'hr-custom-fields',
    match: { kind: 'exact', path: '/hr/custom-fields' },
    title: 'What custom HR fields are for',
    summary:
      'This page lets HR teams define extra fields for employee records. It is used when the default profile and HR file structure does not capture everything the organisation needs to track.',
    highlights: [
      'Use it to extend the structure of HR records without changing the core data model everywhere else.',
      'These fields become part of the recordkeeping workflow for people data.',
    ],
    links: [
      { href: '/hr/records', label: 'Open employee records' },
      { href: '/hr', label: 'Open people overview' },
    ],
  },
  {
    id: 'hr-applications',
    match: { kind: 'exact', path: '/hr/applications' },
    title: 'What the applications inbox is for',
    summary:
      'This page shows job applications across your hiring pipeline. It helps HR teams review applicants across roles, filter the inbox, and decide where attention is needed next.',
    highlights: [
      'Use it for cross-role applicant review rather than a single job pipeline.',
      'Filters help narrow the view by stage, job, department, and date.',
    ],
    links: [
      { href: '/hr/jobs', label: 'Open job listings' },
      { href: '/hr/interviews', label: 'Open interview schedule' },
    ],
  },
  {
    id: 'hr-interviews',
    match: { kind: 'exact', path: '/hr/interviews' },
    title: 'What the interview schedule is for',
    summary:
      'This page coordinates interviews across hiring activity. It helps HR teams manage panel scheduling, interview slots, and the operational side of candidate interviews.',
    highlights: [
      'Use it when you need the scheduling view across roles and candidates.',
      'It sits later in the hiring flow than job setup and request approval.',
    ],
    links: [
      { href: '/hr/applications', label: 'Open applications inbox' },
      { href: '/hr/jobs', label: 'Open job listings' },
    ],
  },
  {
    id: 'hr-jobs',
    match: { kind: 'exact', path: '/hr/jobs' },
    title: 'What job listings are for',
    summary:
      'This page manages the organisation\'s job listings. It is where HR teams browse live and draft roles, open editors, review pipelines, and move between the hiring setup screens for specific jobs.',
    highlights: [
      'Use it as the directory of roles rather than the pipeline for one role.',
      'Open a specific job when you need its editor, preview, legal settings, or applications.',
    ],
    links: [
      { href: '/hr/applications', label: 'Open applications inbox' },
      { href: '/hr/hiring/jobs', label: 'Open hiring hub jobs' },
    ],
  },
  {
    id: 'hr-job-edit',
    match: { kind: 'template', path: '/hr/jobs/[id]/edit' },
    title: 'What this job editor is for',
    summary:
      'This page edits one specific job listing. It is where HR teams shape the advert, workflow, and hiring setup for that role before or while it is live.',
    highlights: [
      'Use it when you are changing the role itself rather than reviewing all jobs.',
      'This is the operational editing screen for one listing.',
    ],
    links: [
      { href: '/hr/jobs', label: 'Back to job listings' },
      { href: '/hr/applications', label: 'Open applications inbox' },
    ],
  },
  {
    id: 'hr-job-preview',
    match: { kind: 'template', path: '/hr/jobs/[id]/preview' },
    title: 'What this job preview is for',
    summary:
      'This page previews how one job listing reads before or alongside publication. It helps HR sense-check the advert content, dates, and candidate-facing information without editing directly.',
    highlights: [
      'Use it as a review screen before publishing or after major edits.',
      'This is for validation and presentation, not for making the actual changes.',
    ],
    links: [
      { href: '/hr/jobs', label: 'Back to job listings' },
      { href: '/hr/jobs', label: 'Open job listings' },
    ],
  },
  {
    id: 'hr-job-applications',
    match: { kind: 'template', path: '/hr/jobs/[id]/applications' },
    title: 'What this job pipeline is for',
    summary:
      'This page is the applicant pipeline for one specific role. It helps HR focus on every candidate attached to that job without the noise of the wider applications inbox.',
    highlights: [
      'Use it when you are hiring for one role in detail.',
      'This is the job-specific view, while the main applications page is the cross-role inbox.',
    ],
    links: [
      { href: '/hr/applications', label: 'Open applications inbox' },
      { href: '/hr/jobs', label: 'Back to job listings' },
    ],
  },
  {
    id: 'hr-job-admin-legal',
    match: { kind: 'template', path: '/hr/jobs/[id]/admin-legal' },
    title: 'What these admin and legal settings are for',
    summary:
      'This page controls the job-specific communication and document settings for one role. It is used for email templates, offer templates, contract templates, and related workflow controls tied to that listing.',
    highlights: [
      'Use it when the hiring workflow for one job needs special handling.',
      'This sits alongside the main job editor rather than replacing it.',
    ],
    links: [
      { href: '/hr/jobs', label: 'Back to job listings' },
      { href: '/hr/offer-templates', label: 'Open offer templates' },
    ],
  },
  {
    id: 'hr-offer-templates',
    match: { kind: 'exact', path: '/hr/offer-templates' },
    title: 'What offer templates are for',
    summary:
      'This page manages reusable offer templates for hiring workflows. It helps HR standardise the documents and messaging used when offers are created for candidates.',
    highlights: [
      'Use it to maintain reusable templates rather than editing a single live offer.',
      'These templates support consistency across the hiring process.',
    ],
    links: [
      { href: '/hr/jobs', label: 'Open job listings' },
      { href: '/hr/hiring/templates', label: 'Open hiring hub templates' },
    ],
  },
  {
    id: 'hr-offer-templates-new',
    match: { kind: 'exact', path: '/hr/offer-templates/new' },
    title: 'What this new offer template page is for',
    summary:
      'This page creates a new reusable offer template. It is used when HR needs a fresh template for a different type of role, contract, or hiring workflow.',
    highlights: [
      'Use it to build a reusable template rather than editing an existing one.',
      'New templates can then be reused across multiple jobs.',
    ],
    links: [
      { href: '/hr/offer-templates', label: 'Back to offer templates' },
      { href: '/hr/jobs', label: 'Open job listings' },
    ],
  },
  {
    id: 'hr-offer-templates-edit',
    match: { kind: 'template', path: '/hr/offer-templates/[id]/edit' },
    title: 'What this offer template editor is for',
    summary:
      'This page edits one reusable offer template. It is where HR updates the structure and content that future offers will reuse.',
    highlights: [
      'Use it when a standard offer needs updating across future hiring activity.',
      'This changes the template source, not just one candidate case.',
    ],
    links: [
      { href: '/hr/offer-templates', label: 'Back to offer templates' },
      { href: '/hr/hiring/templates', label: 'Open hiring hub templates' },
    ],
  },
  {
    id: 'hr-recruitment',
    match: { kind: 'exact', path: '/hr/recruitment' },
    title: 'What the recruitment workspace is for',
    summary:
      'This page is the recruitment requests workspace. Depending on your permissions, it can be used to raise your own hiring requests, review the request queue, or oversee recruitment demand across the organisation.',
    highlights: [
      'It sits before live hiring activity and job pipeline work.',
      'This is the place to capture or review the need to hire in the first place.',
    ],
    links: [
      { href: '/hr/hiring/requests', label: 'Open hiring requests' },
      { href: '/hr/hiring/new-request', label: 'Raise a new request' },
    ],
  },
  {
    id: 'hr-hiring-requests',
    match: { kind: 'exact', path: '/hr/hiring/requests' },
    title: 'What hiring requests are for',
    summary:
      'This page is the hiring request queue inside the hiring hub. It helps HR teams and approvers review open requests, prioritise them, and move them toward approval or fulfilment.',
    highlights: [
      'Use it to manage demand for new roles before focusing on applicants.',
      'This is the queue view, while each request detail page holds the full context for one request.',
    ],
    links: [
      { href: '/hr/hiring/new-request', label: 'Raise a new request' },
      { href: '/hr/hiring/jobs', label: 'Open hiring jobs' },
    ],
  },
  {
    id: 'hr-hiring-request-detail',
    match: { kind: 'template', path: '/hr/hiring/requests/[id]' },
    title: 'What this hiring request is for',
    summary:
      'This page is the detailed record for one hiring request. It helps HR and approvers review the business case, urgency, role details, and current status for that request.',
    highlights: [
      'Use it when you need the full context behind one request.',
      'This is the request-level workspace before the job and applicant workflow takes over.',
    ],
    links: [
      { href: '/hr/hiring/requests', label: 'Back to hiring requests' },
      { href: '/hr/hiring/new-request', label: 'Raise a new request' },
    ],
  },
  {
    id: 'hr-hiring-new-request',
    match: { kind: 'exact', path: '/hr/hiring/new-request' },
    title: 'What this new hiring request page is for',
    summary:
      'This page creates a new hiring request. It is where a manager or HR user captures the need for a role before the organisation moves into job listing and applicant management.',
    highlights: [
      'Use it when the hiring need is still being raised or justified.',
      'This sits earlier in the workflow than job creation and candidate review.',
    ],
    links: [
      { href: '/hr/hiring/requests', label: 'Back to hiring requests' },
      { href: '/hr/recruitment', label: 'Open recruitment workspace' },
    ],
  },
  {
    id: 'hr-hiring-index',
    match: { kind: 'exact', path: '/hr/hiring' },
    title: 'What the hiring hub is for',
    summary:
      'This route is the entry point into the hiring hub. It sends HR users to the most relevant hiring tab for their permissions, such as requests, jobs, applications, interviews, or templates.',
    highlights: [
      'Use the hiring hub for recruitment workflow once a hiring need is active.',
      'It groups the operational hiring tools into one tabbed workspace.',
    ],
    links: [
      { href: '/hr/hiring/requests', label: 'Open hiring requests' },
      { href: '/hr/hiring/jobs', label: 'Open hiring jobs' },
    ],
  },
  {
    id: 'hr-hiring-jobs',
    match: { kind: 'exact', path: '/hr/hiring/jobs' },
    title: 'What hiring jobs are for',
    summary:
      'This page shows job listings inside the hiring hub. It gives HR teams the job-management view in the context of the wider recruitment workflow.',
    highlights: [
      'Use it when you want the jobs view alongside the rest of the hiring hub.',
      'It covers the same subject as job listings, but in the recruitment-tab context.',
    ],
    links: [
      { href: '/hr/jobs', label: 'Open standalone job listings' },
      { href: '/hr/hiring/applications', label: 'Open hiring applications' },
    ],
  },
  {
    id: 'hr-hiring-applications',
    match: { kind: 'exact', path: '/hr/hiring/applications' },
    title: 'What hiring applications are for',
    summary:
      'This page is the applications inbox inside the hiring hub. It helps HR review applicants while staying inside the recruitment tab workflow.',
    highlights: [
      'Use it for cross-role applicant review in the hiring hub context.',
      'It complements the job-specific pipeline pages by giving a wider inbox view.',
    ],
    links: [
      { href: '/hr/applications', label: 'Open standalone applications inbox' },
      { href: '/hr/hiring/interviews', label: 'Open hiring interviews' },
    ],
  },
  {
    id: 'hr-hiring-interviews',
    match: { kind: 'exact', path: '/hr/hiring/interviews' },
    title: 'What hiring interviews are for',
    summary:
      'This page is the interview scheduling view inside the hiring hub. It helps HR manage interviews while staying within the recruitment tab flow.',
    highlights: [
      'Use it when you want the interview schedule as part of the hiring hub journey.',
      'It is closely connected to applicants, panelists, and role-level recruiting activity.',
    ],
    links: [
      { href: '/hr/interviews', label: 'Open standalone interview schedule' },
      { href: '/hr/hiring/applications', label: 'Open hiring applications' },
    ],
  },
  {
    id: 'hr-hiring-templates',
    match: { kind: 'exact', path: '/hr/hiring/templates' },
    title: 'What hiring templates are for',
    summary:
      'This page manages reusable offer and hiring templates inside the hiring hub. It helps HR keep the document side of the hiring flow organised within the recruitment tabs.',
    highlights: [
      'Use it when you want template management in the hiring hub context.',
      'Templates here support consistency across offer creation and related hiring steps.',
    ],
    links: [
      { href: '/hr/offer-templates', label: 'Open standalone offer templates' },
      { href: '/hr/hiring/jobs', label: 'Open hiring jobs' },
    ],
  },
  {
    id: 'hr-hiring-application-forms',
    match: { kind: 'exact', path: '/hr/hiring/application-forms' },
    title: 'What application forms are for',
    summary:
      'This page manages reusable application forms that can be attached to jobs. It helps HR define the questions applicants will answer before a role goes live.',
    highlights: [
      'Use it to create or maintain shared forms across multiple roles.',
      'Open a form editor when you need to change the questions inside one form.',
    ],
    links: [
      { href: '/hr/hiring/jobs', label: 'Open hiring jobs' },
      { href: '/hr/hiring/applications', label: 'Open hiring applications' },
    ],
  },
  {
    id: 'hr-hiring-application-form-edit',
    match: { kind: 'template', path: '/hr/hiring/application-forms/[id]/edit' },
    title: 'What this application form editor is for',
    summary:
      'This page edits one reusable application form. It is where HR defines the question set, structure, and applicant prompts that a role can reuse.',
    highlights: [
      'Use it when you need to change the form itself rather than just preview it.',
      'Changes here affect the reusable form that jobs can be linked to.',
    ],
    links: [
      { href: '/hr/hiring/application-forms', label: 'Back to application forms' },
      { href: '/hr/hiring/jobs', label: 'Open hiring jobs' },
    ],
  },
  {
    id: 'hr-hiring-application-form-preview',
    match: { kind: 'template', path: '/hr/hiring/application-forms/[id]/preview' },
    title: 'What this application form preview is for',
    summary:
      'This page previews how one reusable application form will look to applicants. It helps HR sense-check the candidate experience before attaching the form to a live role.',
    highlights: [
      'Use it for review and QA rather than editing.',
      'This is the candidate-facing preview of the form, not the configuration screen.',
    ],
    links: [
      { href: '/hr/hiring/application-forms', label: 'Back to application forms' },
      { href: '/hr/hiring/jobs', label: 'Open hiring jobs' },
    ],
  },
  {
    id: 'hr-finance',
    match: { kind: 'exact', path: '/hr/finance' },
    title: 'What this HR finance route is for',
    summary:
      'This route is the HR handoff into the finance workspace. It is used when HR users need payroll and time tools that live under the finance section instead of the core HR section.',
    highlights: [
      'It is a navigation bridge into finance rather than a separate HR screen of its own.',
      'Use the finance pages for payroll review, timesheets, and wagesheet operations.',
    ],
    links: [
      { href: '/finance', label: 'Open finance workspace' },
      { href: '/finance/timesheets', label: 'Open timesheet review' },
    ],
  },
  {
    id: 'hr-timesheets',
    match: { kind: 'exact', path: '/hr/timesheets' },
    title: 'What this HR timesheets route is for',
    summary:
      'This route hands HR users into the finance timesheet review screen. That is where submitted weeks are reviewed, approved, or rejected for payroll processing.',
    highlights: [
      'It points to the shared payroll review workflow rather than a separate HR-only screen.',
      'Use it when reviewing submitted time before it becomes payroll data.',
    ],
    links: [
      { href: '/finance/timesheets', label: 'Open timesheet review' },
      { href: '/finance/wagesheets', label: 'Open wagesheets' },
    ],
  },
  {
    id: 'hr-wagesheets',
    match: { kind: 'exact', path: '/hr/wagesheets' },
    title: 'What this HR wagesheets route is for',
    summary:
      'This route hands HR users into the finance wagesheets view. That is where approved time and payroll lines are reviewed in payroll-ready form.',
    highlights: [
      'It links HR users into the payroll output side of the workflow.',
      'Use it after timesheet approval when you need the wagesheet result.',
    ],
    links: [
      { href: '/finance/wagesheets', label: 'Open wagesheets' },
      { href: '/finance/timesheets', label: 'Open timesheet review' },
    ],
  },
  {
    id: 'hr-attendance-settings',
    match: { kind: 'exact', path: '/hr/attendance-settings' },
    title: 'What this attendance settings route is for',
    summary:
      'This route hands HR users into the shared attendance settings screen in finance. That is where attendance-site and clocking policies are configured for payroll and time workflows.',
    highlights: [
      'It is a bridge into the shared attendance configuration tools.',
      'Use it when geofences or attendance policy rules need changing.',
    ],
    links: [
      { href: '/finance/attendance-settings', label: 'Open attendance settings' },
      { href: '/finance', label: 'Open finance workspace' },
    ],
  },
];

function pathSegments(path: string): string[] {
  return path.trim().split('/').filter(Boolean);
}

function matchesTemplate(templatePath: string, pathname: string): boolean {
  const templateSegments = pathSegments(templatePath);
  const actualSegments = pathSegments(pathname);
  if (templateSegments.length !== actualSegments.length) return false;

  return templateSegments.every((segment, idx) => {
    if (/^\[[^/\]]+\]$/.test(segment)) return actualSegments[idx]!.length > 0;
    if (/^:[^/]+$/.test(segment)) return actualSegments[idx]!.length > 0;
    if (segment === '*') return true;
    return segment === actualSegments[idx];
  });
}

export function matchPageInfo(pathname: string): PageInfoEntry | null {
  const cleanPath = pathname.trim();
  if (!cleanPath) return null;

  for (const entry of PAGE_INFO_ENTRIES) {
    if (entry.match.kind === 'exact' && cleanPath === entry.match.path) return entry;
    if (entry.match.kind === 'template' && matchesTemplate(entry.match.path, cleanPath)) return entry;
    if (entry.match.kind === 'prefix' && (cleanPath === entry.match.path || cleanPath.startsWith(`${entry.match.path}/`))) {
      return entry;
    }
  }

  return null;
}
