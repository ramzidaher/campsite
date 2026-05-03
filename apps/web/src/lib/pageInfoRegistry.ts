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
  {
    id: 'admin-overview',
    match: { kind: 'exact', path: '/admin' },
    title: 'What the admin overview is for',
    summary:
      'This page is the organisation control tower for Campsite. It gives admins a quick snapshot of approvals, people operations, compliance, and shared workspace setup so they can jump into the right admin tool quickly.',
    highlights: [
      'Use it when you need the big-picture view rather than one specialist screen.',
      'The cards here act as shortcuts into members, settings, recruitment, privacy, and other organisation-wide controls.',
    ],
    links: [
      { href: '/admin/users', label: 'Open member directory' },
      { href: '/admin/settings', label: 'Open org settings' },
    ],
  },
  {
    id: 'admin-applications',
    match: { kind: 'exact', path: '/admin/applications' },
    title: 'What the admin applications inbox is for',
    summary:
      'This page shows candidates across your hiring pipeline in one filtered inbox. It helps admins review applications across many roles without opening each job pipeline separately.',
    highlights: [
      'Use it for cross-role candidate review rather than one job at a time.',
      'Filters help narrow the list by stage, job, department, and date range.',
    ],
    links: [
      { href: '/admin/jobs', label: 'Open job listings' },
      { href: '/admin/interviews', label: 'Open interview schedule' },
    ],
  },
  {
    id: 'admin-broadcasts',
    match: { kind: 'exact', path: '/admin/broadcasts' },
    title: 'What admin broadcasts are for',
    summary:
      'This page gives admins oversight of organisation announcements and broadcast workflows. It helps you review what has been drafted, scheduled, submitted for approval, or already sent across the workspace.',
    highlights: [
      'Use it when you need operational visibility over communications rather than just your own feed.',
      'It is especially useful for governance, moderation, and organisation-wide message planning.',
    ],
    links: [
      { href: '/broadcasts', label: 'Open broadcast feed' },
      { href: '/admin/pending', label: 'Open approval queue' },
    ],
  },
  {
    id: 'admin-categories',
    match: { kind: 'exact', path: '/admin/categories' },
    title: 'What broadcast channels are for',
    summary:
      'Broadcast channels are per-department audience lists. Members follow a channel in Settings to receive targeted (non–org-wide) posts sent to that channel. This screen is the bulk editor; the same rows exist under Admin → Departments for each department.',
    highlights: [
      'Requires the same access as department admin tools (departments.view). Only effective organisation admins can create or delete channels at the database layer.',
      'Managers use Manager → Departments to see which channels exist for their departments; they cannot add channels unless product policy grants it.',
    ],
    links: [
      { href: '/admin/departments', label: 'Open departments' },
      { href: '/admin/teams', label: 'Open teams' },
    ],
  },
  {
    id: 'admin-departments',
    match: { kind: 'exact', path: '/admin/departments' },
    title: 'What departments are for',
    summary:
      'This page manages the organisation department directory. It is where admins define department structure, assign ownership, and keep people grouped correctly for reporting and operations.',
    highlights: [
      'Use it for top-level org structure rather than day-to-day staff records.',
      'Department setup influences teams, recruitment filters, reporting, and permissions context.',
    ],
    links: [
      { href: '/admin/teams', label: 'Open teams' },
      { href: '/admin/users', label: 'Open member directory' },
    ],
  },
  {
    id: 'admin-hr-directory',
    match: { kind: 'exact', path: '/admin/hr' },
    title: 'What the admin HR directory is for',
    summary:
      'This page is the organisation-wide directory of employee HR files. It helps admins and HR leads locate a person quickly before opening the detailed record for that individual.',
    highlights: [
      'Use it as the entry point into people records, not the full record itself.',
      'This is where organisation-wide HR administration usually starts.',
    ],
    links: [
      { href: '/admin/hr/onboarding', label: 'Open onboarding hub' },
      { href: '/admin/hr/performance', label: 'Open performance cycles' },
    ],
  },
  {
    id: 'admin-hr-record-detail',
    match: { kind: 'template', path: '/admin/hr/[userId]' },
    title: 'What this employee HR file is for',
    summary:
      'This page is the detailed HR file for one employee. It brings together personal record data, documents, payroll-adjacent information, history, and case notes used to manage that person properly.',
    highlights: [
      'Use it when you are handling one employee case in depth.',
      'Changes here affect the individual record, so it is suited to detailed HR administration and audits.',
    ],
    links: [
      { href: '/admin/hr', label: 'Back to HR directory' },
      { href: '/admin/hr/absence-reporting', label: 'Open absence reporting' },
    ],
  },
  {
    id: 'admin-hr-absence-reporting',
    match: { kind: 'exact', path: '/admin/hr/absence-reporting' },
    title: 'What admin absence reporting is for',
    summary:
      'This page helps admins and HR leads review absence patterns across the organisation. It is used to spot trends, investigate repeated issues, and support follow-up where needed.',
    highlights: [
      'Use it for pattern monitoring and case review rather than simple leave booking.',
      'It is especially useful when you need to compare absence history across teams or departments.',
    ],
    links: [
      { href: '/admin/leave', label: 'Open leave admin' },
      { href: '/admin/hr/hr-metric-alerts', label: 'Open HR metric alerts' },
    ],
  },
  {
    id: 'admin-hr-custom-fields',
    match: { kind: 'exact', path: '/admin/hr/custom-fields' },
    title: 'What admin HR custom fields are for',
    summary:
      'This page lets admins extend the structure of employee HR records with extra fields. It is used when the default record layout does not capture all of the data your organisation needs.',
    highlights: [
      'Use it to shape the record model used across the organisation.',
      'These fields become part of the wider HR recordkeeping workflow for staff data.',
    ],
    links: [
      { href: '/admin/hr', label: 'Open HR directory' },
      { href: '/admin/users', label: 'Open member directory' },
    ],
  },
  {
    id: 'admin-hr-metric-alerts',
    match: { kind: 'exact', path: '/admin/hr/hr-metric-alerts' },
    title: 'What admin HR metric alerts are for',
    summary:
      'This page configures the thresholds behind HR alerts across the organisation. It is where admins tune how sensitive the system should be to absence, working-hours, and related people-risk signals.',
    highlights: [
      'Use it to decide when the system should flag a concern, not to review one employee case.',
      'These settings shape how proactive the HR alerting layer will be.',
    ],
    links: [
      { href: '/admin/hr/absence-reporting', label: 'Open absence reporting' },
      { href: '/admin/hr', label: 'Open HR directory' },
    ],
  },
  {
    id: 'admin-hr-onboarding',
    match: { kind: 'exact', path: '/admin/hr/onboarding' },
    title: 'What admin onboarding is for',
    summary:
      'This page manages onboarding runs across the organisation. It helps admins and HR leads coordinate checklists, owners, and progress for new starters at scale.',
    highlights: [
      'Use it to monitor or launch onboarding activity across multiple people.',
      'Open an individual run when you need the detailed checklist for one starter.',
    ],
    links: [
      { href: '/admin/hr', label: 'Open HR directory' },
      { href: '/admin/hr/org-chart', label: 'Open org chart' },
    ],
  },
  {
    id: 'admin-hr-onboarding-run',
    match: { kind: 'template', path: '/admin/hr/onboarding/[runId]' },
    title: 'What this admin onboarding run is for',
    summary:
      'This page is the detailed onboarding workspace for one run. It helps admins, HR, and managers track the tasks, owners, and completion status for a specific joiner.',
    highlights: [
      'Use it when one onboarding case needs attention in detail.',
      'This is the execution view for a run rather than the overview of all onboarding activity.',
    ],
    links: [
      { href: '/admin/hr/onboarding', label: 'Back to onboarding hub' },
      { href: '/admin/hr', label: 'Open HR directory' },
    ],
  },
  {
    id: 'admin-hr-one-on-ones',
    match: { kind: 'exact', path: '/admin/hr/one-on-ones' },
    title: 'What admin 1:1 oversight is for',
    summary:
      'This page gives HR and admins oversight of one-to-one check-in coverage across the organisation. It helps you see whether regular manager conversations are happening and where follow-up may be needed.',
    highlights: [
      'Use it to monitor compliance and consistency rather than to run your own personal check-ins.',
      'It complements performance cycles by covering the ongoing conversation layer between bigger reviews.',
    ],
    links: [
      { href: '/admin/hr/performance', label: 'Open performance cycles' },
      { href: '/one-on-ones', label: 'Open personal 1:1 hub' },
    ],
  },
  {
    id: 'admin-hr-org-chart',
    match: { kind: 'exact', path: '/admin/hr/org-chart' },
    title: 'What the admin org chart is for',
    summary:
      'This page shows the organisation reporting structure from an HR and admin perspective. It helps leaders review manager chains, structural gaps, and how departments and teams connect.',
    highlights: [
      'Use it to sense-check organisational design and reporting lines.',
      'It is especially helpful during restructures, onboarding planning, and access reviews.',
    ],
    links: [
      { href: '/admin/departments', label: 'Open departments' },
      { href: '/admin/teams', label: 'Open teams' },
    ],
  },
  {
    id: 'admin-hr-performance',
    match: { kind: 'exact', path: '/admin/hr/performance' },
    title: 'What admin performance cycles are for',
    summary:
      'This page manages performance review cycles across the organisation. It helps admins and HR leads launch, monitor, and revisit review programmes rather than focusing on a single employee review.',
    highlights: [
      'Use it for cycle management at organisation level.',
      'Open a specific cycle when you need the detailed status of one review programme.',
    ],
    links: [
      { href: '/admin/hr/one-on-ones', label: 'Open 1:1 oversight' },
      { href: '/admin/hr', label: 'Open HR directory' },
    ],
  },
  {
    id: 'admin-hr-performance-cycle',
    match: { kind: 'template', path: '/admin/hr/performance/[cycleId]' },
    title: 'What this admin review cycle is for',
    summary:
      'This page is the detailed workspace for one performance review cycle. It helps admins and HR track participation, progress, deadlines, and outcomes for that specific programme.',
    highlights: [
      'Use it when you are actively managing one review cycle rather than the overall setup.',
      'This is where the operational detail of a single programme lives.',
    ],
    links: [
      { href: '/admin/hr/performance', label: 'Back to performance cycles' },
      { href: '/admin/hr/one-on-ones', label: 'Open 1:1 oversight' },
    ],
  },
  {
    id: 'admin-interviews',
    match: { kind: 'exact', path: '/admin/interviews' },
    title: 'What the admin interview schedule is for',
    summary:
      'This page coordinates interviews across live hiring activity. It helps admins and hiring leads manage slots, panel availability, and the operational schedule behind candidate interviews.',
    highlights: [
      'Use it when you need the scheduling view across jobs and candidates.',
      'It sits later in the hiring flow than request approval and job setup.',
    ],
    links: [
      { href: '/admin/jobs', label: 'Open job listings' },
      { href: '/admin/applications', label: 'Open applications inbox' },
    ],
  },
  {
    id: 'admin-jobs',
    match: { kind: 'exact', path: '/admin/jobs' },
    title: 'What admin job listings are for',
    summary:
      'This page is the directory of job listings for the organisation. It helps admins browse live and draft roles, open editors, and move into the hiring tools for each specific listing.',
    highlights: [
      'Use it as the list of roles rather than the candidate pipeline for one role.',
      'Open a specific job when you need its editor, legal settings, or applications.',
    ],
    links: [
      { href: '/admin/applications', label: 'Open applications inbox' },
      { href: '/admin/interviews', label: 'Open interview schedule' },
    ],
  },
  {
    id: 'admin-job-edit',
    match: { kind: 'template', path: '/admin/jobs/[id]/edit' },
    title: 'What this admin job editor is for',
    summary:
      'This page edits one specific job listing. It is where admins shape the role advert, workflow, and hiring setup before or while the listing is live.',
    highlights: [
      'Use it when you are changing the role itself rather than reviewing all jobs.',
      'This is the operational editing screen for one listing.',
    ],
    links: [
      { href: '/admin/jobs', label: 'Back to job listings' },
      { href: '/admin/interviews', label: 'Open interview schedule' },
    ],
  },
  {
    id: 'admin-job-applications',
    match: { kind: 'template', path: '/admin/jobs/[id]/applications' },
    title: 'What this admin job pipeline is for',
    summary:
      'This page is the candidate pipeline for one specific role. It helps admins focus on every applicant tied to that job without the noise of the wider applications inbox.',
    highlights: [
      'Use it when you are hiring for one role in detail.',
      'This is the job-specific view, while the main applications page is the cross-role inbox.',
    ],
    links: [
      { href: '/admin/applications', label: 'Open applications inbox' },
      { href: '/admin/interviews', label: 'Open interview schedule' },
    ],
  },
  {
    id: 'admin-job-admin-legal',
    match: { kind: 'template', path: '/admin/jobs/[id]/admin-legal' },
    title: 'What these admin and legal job settings are for',
    summary:
      'This page controls the job-specific communication and document rules for one listing. It is used for offer templates, workflow settings, and the legal or administrative details tied to that role.',
    highlights: [
      'Use it when the hiring workflow for one job needs special handling.',
      'It sits alongside the main job editor rather than replacing it.',
    ],
    links: [
      { href: '/admin/jobs', label: 'Back to job listings' },
      { href: '/admin/offer-templates', label: 'Open offer templates' },
    ],
  },
  {
    id: 'admin-leave',
    match: { kind: 'exact', path: '/admin/leave' },
    title: 'What admin leave management is for',
    summary:
      'This page is the organisation-level leave workspace. It helps admins review requests, balances, policies, and leave operations across the whole organisation instead of just one team.',
    highlights: [
      'Use it when you are managing leave rules or high-level leave operations.',
      'It complements absence reporting by covering request handling and policy administration.',
    ],
    links: [
      { href: '/leave', label: 'Open leave hub' },
      { href: '/admin/hr/absence-reporting', label: 'Open absence reporting' },
    ],
  },
  {
    id: 'admin-offer-templates',
    match: { kind: 'exact', path: '/admin/offer-templates' },
    title: 'What admin offer templates are for',
    summary:
      'This page manages reusable offer templates for hiring workflows. It helps admins standardise the documents and messaging used when candidate offers are created.',
    highlights: [
      'Use it to maintain reusable templates rather than one live offer.',
      'These templates support consistency across jobs and hiring teams.',
    ],
    links: [
      { href: '/admin/jobs', label: 'Open job listings' },
      { href: '/admin/recruitment', label: 'Open recruitment queue' },
    ],
  },
  {
    id: 'admin-offer-templates-new',
    match: { kind: 'exact', path: '/admin/offer-templates/new' },
    title: 'What this new admin offer template page is for',
    summary:
      'This page creates a new reusable offer template. It is used when your organisation needs a fresh template for a new contract type, role family, or hiring workflow.',
    highlights: [
      'Use it to build a reusable template rather than editing an existing one.',
      'New templates can then be linked into future hiring activity.',
    ],
    links: [
      { href: '/admin/offer-templates', label: 'Back to offer templates' },
      { href: '/admin/jobs', label: 'Open job listings' },
    ],
  },
  {
    id: 'admin-offer-templates-edit',
    match: { kind: 'template', path: '/admin/offer-templates/[id]/edit' },
    title: 'What this admin offer template editor is for',
    summary:
      'This page edits one reusable offer template. It is where admins update the content and structure that future offers will reuse.',
    highlights: [
      'Use it when a standard offer needs updating across future hiring activity.',
      'This changes the template source, not just one candidate case.',
    ],
    links: [
      { href: '/admin/offer-templates', label: 'Back to offer templates' },
      { href: '/admin/jobs', label: 'Open job listings' },
    ],
  },
  {
    id: 'admin-pending-members',
    match: { kind: 'exact', path: '/admin/pending' },
    title: 'What pending member approvals are for',
    summary:
      'This page is the approval queue for new members waiting to join the organisation workspace. It helps admins review registrations before those people are allowed into Campsite.',
    highlights: [
      'Use it when you need to approve, reject, or bulk-review incoming membership requests.',
      'It is focused on access approval rather than ongoing member record management.',
    ],
    links: [
      { href: '/admin/users', label: 'Open member directory' },
      { href: '/pending-approvals', label: 'Open shared approval view' },
    ],
  },
  {
    id: 'admin-recruitment',
    match: { kind: 'exact', path: '/admin/recruitment' },
    title: 'What the admin recruitment queue is for',
    summary:
      'This page is the organisation queue for recruitment requests. It helps admins review hiring demand, approvals, urgency, and the intake process before work moves fully into jobs and applicants.',
    highlights: [
      'Use it at the request and approval stage of hiring.',
      'This sits before the live job pipeline and interview scheduling steps.',
    ],
    links: [
      { href: '/admin/jobs', label: 'Open job listings' },
      { href: '/admin/interviews', label: 'Open interview schedule' },
    ],
  },
  {
    id: 'admin-recruitment-detail',
    match: { kind: 'template', path: '/admin/recruitment/[id]' },
    title: 'What this admin recruitment request is for',
    summary:
      'This page is the detailed record for one recruitment request. It helps admins review the business case, timeline, role context, and status for that specific hiring need.',
    highlights: [
      'Use it when one request needs full context and decision-making detail.',
      'This is the request-level workspace before the job and applicant workflow takes over.',
    ],
    links: [
      { href: '/admin/recruitment', label: 'Back to recruitment queue' },
      { href: '/admin/jobs', label: 'Open job listings' },
    ],
  },
  {
    id: 'admin-roles',
    match: { kind: 'exact', path: '/admin/roles' },
    title: 'What roles and permissions are for',
    summary:
      'This page manages the organisation permission model. It helps admins control what different roles can see and do across Campsite, including custom roles and governance-sensitive actions.',
    highlights: [
      'Use it when access rules or responsibility boundaries need changing.',
      'Changes here can affect many workflows at once, so it is one of the highest-impact admin pages.',
    ],
    links: [
      { href: '/admin/users', label: 'Open member directory' },
      { href: '/admin/settings', label: 'Open org settings' },
    ],
  },
  {
    id: 'admin-rota',
    match: { kind: 'exact', path: '/admin/rota' },
    title: 'What admin rota management is for',
    summary:
      'This page is the organisation-level rota workspace. It helps admins oversee scheduled shifts, rota structure, and operational staffing changes across the workspace.',
    highlights: [
      'Use it for rota oversight and planning rather than just viewing your own shifts.',
      'It pairs with rota imports when schedule data is being brought in from spreadsheets.',
    ],
    links: [
      { href: '/rota', label: 'Open rota' },
      { href: '/admin/rota-import', label: 'Open rota import' },
    ],
  },
  {
    id: 'admin-rota-import',
    match: { kind: 'exact', path: '/admin/rota-import' },
    title: 'What rota import is for',
    summary:
      'This page manages rota imports from Google Sheets and shows the sync history behind them. It helps admins bring external rota data into Campsite in a controlled way.',
    highlights: [
      'Use it when schedules are maintained in spreadsheets and need to be imported into the app.',
      'The history view helps you confirm when a sync ran and whether it succeeded.',
    ],
    links: [
      { href: '/admin/integrations', label: 'Open integrations' },
      { href: '/admin/rota', label: 'Open admin rota' },
    ],
  },
  {
    id: 'admin-sub-teams',
    match: { kind: 'exact', path: '/admin/sub-teams' },
    title: 'What this legacy sub-teams route is for',
    summary:
      'This route exists to catch older links and now redirects to the main admin teams workspace. It keeps old bookmarks working while the newer team structure remains the source of truth.',
    highlights: [
      'Use the teams page for current team management.',
      'This route is mainly a compatibility bridge rather than a separate workspace.',
    ],
    links: [
      { href: '/admin/teams', label: 'Open teams' },
      { href: '/admin/departments', label: 'Open departments' },
    ],
  },
  {
    id: 'admin-system-overview',
    match: { kind: 'exact', path: '/admin/system-overview' },
    title: 'What the system overview is for',
    summary:
      'This page is a high-level map of how the organisation is structured and connected inside Campsite. It helps admins understand the relationships between departments, teams, members, and related operational data.',
    highlights: [
      'Use it when you need to understand the overall shape of the workspace rather than edit one record.',
      'It is especially helpful for audits, troubleshooting, and onboarding new admins.',
    ],
    links: [
      { href: '/admin/departments', label: 'Open departments' },
      { href: '/admin/users', label: 'Open member directory' },
    ],
  },
  {
    id: 'admin-teams',
    match: { kind: 'exact', path: '/admin/teams' },
    title: 'What admin teams are for',
    summary:
      'This page manages team structure inside the organisation. It helps admins organise smaller working groups, assign people correctly, and keep team-level operations tidy beneath the department layer.',
    highlights: [
      'Use it for day-to-day structural grouping beneath departments.',
      'Team setup affects manager workspaces, rota organisation, and internal communication targeting.',
    ],
    links: [
      { href: '/admin/departments', label: 'Open departments' },
      { href: '/admin/users', label: 'Open member directory' },
    ],
  },
  {
    id: 'admin-users',
    match: { kind: 'exact', path: '/admin/users' },
    title: 'What the member directory is for',
    summary:
      'This page is the central directory for organisation members. It helps admins review who belongs to the workspace, adjust access-related details, and move into more detailed record or permission workflows.',
    highlights: [
      'Use it when you are managing the people in the workspace rather than system settings.',
      'It is often the starting point for role changes, access checks, and member cleanup.',
    ],
    links: [
      { href: '/admin/pending', label: 'Open pending approvals' },
      { href: '/admin/roles', label: 'Open roles and permissions' },
    ],
  },
  {
    id: 'attendance',
    match: { kind: 'exact', path: '/attendance' },
    title: 'What attendance is for',
    summary:
      'This page is where you clock in and out for work. It helps staff capture attendance time that later feeds into manager review and payroll workflows when clocking is enabled.',
    highlights: [
      'Use it while you are starting or ending a shift rather than for rota planning.',
      'Submitted time moves into the wider timesheet and payroll process after you record it here.',
    ],
    links: [
      { href: '/rota', label: 'Open rota' },
      { href: '/leave', label: 'Open leave hub' },
    ],
  },
  {
    id: 'broadcasts',
    match: { kind: 'exact', path: '/broadcasts' },
    title: 'What the broadcasts hub is for',
    summary:
      'This page is the organisation communication hub for announcements and updates. It helps members read important broadcasts, and for authorised users it also supports drafting, scheduling, and submitting messages.',
    highlights: [
      'Use it when you need the message feed for the organisation.',
      'If you can compose, the extra tabs here are for draft and publishing workflow rather than simple reading.',
    ],
    links: [
      { href: '/dashboard', label: 'Open dashboard' },
      { href: '/calendar', label: 'Open calendar' },
    ],
  },
  {
    id: 'broadcast-detail',
    match: { kind: 'template', path: '/broadcasts/[id]' },
    title: 'What this broadcast detail page is for',
    summary:
      'This page shows one specific broadcast in full. It helps you read the complete announcement, context, and any attached detail without the noise of the wider feed.',
    highlights: [
      'Use it when one update needs focused attention.',
      'This is the reading view for a single broadcast rather than the inbox of all broadcasts.',
    ],
    links: [
      { href: '/broadcasts', label: 'Back to broadcasts' },
      { href: '/dashboard', label: 'Open dashboard' },
    ],
  },
  {
    id: 'broadcast-edit',
    match: { kind: 'template', path: '/broadcasts/[id]/edit' },
    title: 'What this broadcast editor is for',
    summary:
      'This page edits one specific broadcast draft or scheduled message. It is where authorised users refine the content, targeting, and publication details before it is sent.',
    highlights: [
      'Use it when you are actively working on one announcement.',
      'This is the editing screen for a single message rather than the overall broadcast feed.',
    ],
    links: [
      { href: '/broadcasts', label: 'Back to broadcasts' },
      { href: '/dashboard', label: 'Open dashboard' },
    ],
  },
  {
    id: 'calendar',
    match: { kind: 'exact', path: '/calendar' },
    title: 'What the calendar is for',
    summary:
      'This page is the shared scheduling view for your Campsite workspace. It helps members see work events, leave, interviews, check-ins, and other time-based activity in one place.',
    highlights: [
      'Use it when you need the time-based view across your work life rather than one workflow in isolation.',
      'It is especially useful for spotting clashes, upcoming events, and team availability.',
    ],
    links: [
      { href: '/rota', label: 'Open rota' },
      { href: '/leave', label: 'Open leave hub' },
    ],
  },
  {
    id: 'dashboard',
    match: { kind: 'exact', path: '/dashboard' },
    title: 'What the dashboard is for',
    summary:
      'This page is your main home view in Campsite. It gives you a high-level snapshot of what matters next, including quick actions, alerts, and links into the parts of the workspace you use most.',
    highlights: [
      'Use it as the launchpad for your day rather than a deep specialist tool.',
      'The cards and metrics here help surface what needs attention without making you hunt through every section manually.',
    ],
    links: [
      { href: '/broadcasts', label: 'Open broadcasts' },
      { href: '/calendar', label: 'Open calendar' },
    ],
  },
  {
    id: 'leave',
    match: { kind: 'exact', path: '/leave' },
    title: 'What the leave hub is for',
    summary:
      'This page is the workspace for leave and time-off activity. It helps members request time away, track balances, and for authorised users approve or manage leave across teams.',
    highlights: [
      'Use it when you are dealing with leave requests, allowances, or approval status.',
      'It complements absence reporting by focusing on request handling and planned time away.',
    ],
    links: [
      { href: '/calendar', label: 'Open calendar' },
      { href: '/notifications/leave', label: 'Open leave notifications' },
    ],
  },
  {
    id: 'maintenance-route',
    match: { kind: 'exact', path: '/maintenance' },
    title: 'What this maintenance route is for',
    summary:
      'This route exists to support maintenance mode handling in the main app shell. If your organisation is placed into maintenance mode, Campsite uses this state to block normal work until service is available again.',
    highlights: [
      'This is a system route rather than a day-to-day workspace.',
      'In practice you will usually be redirected or shown a maintenance overlay instead of using this page directly.',
    ],
    links: [{ href: '/dashboard', label: 'Open dashboard' }],
  },
  {
    id: 'manager-overview',
    match: { kind: 'exact', path: '/manager' },
    title: 'What the manager overview is for',
    summary:
      'This page is the manager workspace dashboard. It gives leaders a quick operational view of their teams, upcoming items, staffing signals, and recruitment-related actions.',
    highlights: [
      'Use it for the manager-level snapshot rather than one detailed admin screen.',
      'It is designed to help leaders move quickly between team oversight and day-to-day follow-up.',
    ],
    links: [
      { href: '/manager/teams', label: 'Open manager teams' },
      { href: '/manager/departments', label: 'Open manager departments' },
    ],
  },
  {
    id: 'manager-departments',
    match: { kind: 'exact', path: '/manager/departments' },
    title: 'What manager departments are for',
    summary:
      'This page gives managers a structured view of the departments they can work with. It helps them understand membership, ownership, and team organisation within their management scope.',
    highlights: [
      'Use it for department-level oversight rather than one individual employee record.',
      'It supports planning, communication, and structural visibility for manager responsibilities.',
    ],
    links: [
      { href: '/manager/teams', label: 'Open manager teams' },
      { href: '/manager/org-chart', label: 'Open manager org chart' },
    ],
  },
  {
    id: 'manager-org-chart',
    match: { kind: 'exact', path: '/manager/org-chart' },
    title: 'What the manager org chart is for',
    summary:
      'This page shows the reporting and team structure for the manager workspace. It helps leaders understand how people, teams, and reporting lines connect inside their scope.',
    highlights: [
      'Use it to sense-check manager visibility and organisational structure.',
      'It is especially useful during team changes, onboarding, and approval decisions.',
    ],
    links: [
      { href: '/manager/departments', label: 'Open manager departments' },
      { href: '/manager/teams', label: 'Open manager teams' },
    ],
  },
  {
    id: 'manager-recruitment',
    match: { kind: 'exact', path: '/manager/recruitment' },
    title: 'What this manager recruitment route is for',
    summary:
      'This route exists as a manager handoff into the recruitment request workflow. It keeps older links working while managers are directed into the current hiring request experience.',
    highlights: [
      'Use the hiring request workspace for active recruitment work.',
      'This route is mainly a compatibility bridge rather than a standalone tool.',
    ],
    links: [
      { href: '/hr/hiring/requests', label: 'Open hiring requests' },
      { href: '/manager', label: 'Open manager overview' },
    ],
  },
  {
    id: 'manager-sub-teams',
    match: { kind: 'exact', path: '/manager/sub-teams' },
    title: 'What this manager sub-teams route is for',
    summary:
      'This route exists to support older manager links and now redirects to the main teams workspace. It keeps bookmarks working while team management lives under the newer route.',
    highlights: [
      'Use the teams page for current manager team administration.',
      'This route is mainly a redirect bridge rather than a separate workspace.',
    ],
    links: [
      { href: '/manager/teams', label: 'Open manager teams' },
      { href: '/manager/departments', label: 'Open manager departments' },
    ],
  },
  {
    id: 'manager-system-overview',
    match: { kind: 'exact', path: '/manager/system-overview' },
    title: 'What the manager workspace map is for',
    summary:
      'This page gives managers a high-level map of the people and structure they oversee. It helps leaders understand how teams, departments, and member relationships fit together within their remit.',
    highlights: [
      'Use it when you need context across your whole management area rather than one team at a time.',
      'It is helpful for planning, onboarding, and troubleshooting ownership questions.',
    ],
    links: [
      { href: '/manager/departments', label: 'Open manager departments' },
      { href: '/manager/teams', label: 'Open manager teams' },
    ],
  },
  {
    id: 'manager-teams',
    match: { kind: 'exact', path: '/manager/teams' },
    title: 'What manager teams are for',
    summary:
      'This page is the manager workspace for team-level organisation. It helps leaders review team membership, structure, and assignments across the teams they are responsible for.',
    highlights: [
      'Use it for hands-on team organisation beneath the department level.',
      'It is especially useful when people move between teams or new groups need to be set up clearly.',
    ],
    links: [
      { href: '/manager/departments', label: 'Open manager departments' },
      { href: '/manager/org-chart', label: 'Open manager org chart' },
    ],
  },
  {
    id: 'notification-applications',
    match: { kind: 'exact', path: '/notifications/applications' },
    title: 'What application notifications are for',
    summary:
      'This page is the focused inbox for candidate and job-application updates. It helps hiring teams catch changes such as new submissions, stage movement, or other applicant activity that needs follow-up.',
    highlights: [
      'Use it when you want hiring updates separated from the rest of your alerts.',
      'It complements the wider applications workspace by showing what changed most recently.',
    ],
    links: [
      { href: '/hr/applications', label: 'Open applications inbox' },
      { href: '/settings', label: 'Open settings' },
    ],
  },
  {
    id: 'notification-calendar',
    match: { kind: 'exact', path: '/notifications/calendar' },
    title: 'What calendar notifications are for',
    summary:
      'This page is the focused inbox for scheduling and calendar-related updates. It helps you keep on top of new events, changes, and reminders that affect your working day.',
    highlights: [
      'Use it when you want schedule changes separated from other product notifications.',
      'It pairs with the main calendar view so you can move from alerts into planning.',
    ],
    links: [
      { href: '/calendar', label: 'Open calendar' },
      { href: '/settings', label: 'Open settings' },
    ],
  },
  {
    id: 'notification-hr-metrics',
    match: { kind: 'exact', path: '/notifications/hr-metrics' },
    title: 'What HR metric notifications are for',
    summary:
      'This page is the focused inbox for HR alerts and metric-driven signals. It helps authorised users notice when absence, hours, or related thresholds have triggered attention.',
    highlights: [
      'Use it when you want people-risk alerts separated from ordinary notifications.',
      'It complements the reporting and case-review pages by surfacing what changed recently.',
    ],
    links: [
      { href: '/hr/absence-reporting', label: 'Open absence reporting' },
      { href: '/settings', label: 'Open settings' },
    ],
  },
  {
    id: 'notification-leave',
    match: { kind: 'exact', path: '/notifications/leave' },
    title: 'What leave notifications are for',
    summary:
      'This page is the focused inbox for leave and time-off updates. It helps members and approvers notice request changes, approvals, and other leave-related activity quickly.',
    highlights: [
      'Use it when you want leave activity separated from other notifications.',
      'It is especially useful if you approve requests for a team or need to track your own request changes.',
    ],
    links: [
      { href: '/leave', label: 'Open leave hub' },
      { href: '/settings', label: 'Open settings' },
    ],
  },
  {
    id: 'notification-recruitment',
    match: { kind: 'exact', path: '/notifications/recruitment' },
    title: 'What recruitment notifications are for',
    summary:
      'This page is the focused inbox for recruitment request and hiring-workflow updates. It helps hiring teams notice changes in demand, approvals, and other recruitment activity without losing them in a mixed feed.',
    highlights: [
      'Use it when you want recruitment workflow changes grouped together.',
      'It complements the hiring request workspace by surfacing what changed most recently.',
    ],
    links: [
      { href: '/hr/hiring/requests', label: 'Open hiring requests' },
      { href: '/settings', label: 'Open settings' },
    ],
  },
  {
    id: 'onboarding-self',
    match: { kind: 'exact', path: '/onboarding' },
    title: 'What your onboarding page is for',
    summary:
      'This page shows the onboarding run assigned to you. It helps new starters or transferring staff track their checklist, complete tasks, and understand what still needs to be done.',
    highlights: [
      'Use it when you need your own onboarding tasks rather than the organisation-wide onboarding admin tools.',
      'It is the execution view for your personal onboarding progress.',
    ],
    links: [
      { href: '/profile', label: 'Open profile' },
      { href: '/dashboard', label: 'Open dashboard' },
    ],
  },
  {
    id: 'one-on-ones',
    match: { kind: 'exact', path: '/one-on-ones' },
    title: 'What the 1:1 hub is for',
    summary:
      'This page is the hub for recurring one-to-one check-ins. It helps managers and employees keep conversations structured, visible, and easy to revisit between larger review cycles.',
    highlights: [
      'Use it for ongoing check-ins rather than formal performance review programmes.',
      'It is especially useful for keeping follow-up actions and meeting history together.',
    ],
    links: [
      { href: '/performance', label: 'Open performance reviews' },
      { href: '/calendar', label: 'Open calendar' },
    ],
  },
  {
    id: 'one-on-one-detail',
    match: { kind: 'template', path: '/one-on-ones/[meetingId]' },
    title: 'What this 1:1 detail page is for',
    summary:
      'This page shows one specific one-to-one meeting in detail. It helps the participants review notes, follow-up items, and any edit-request workflow tied to that check-in.',
    highlights: [
      'Use it when you need the full history and notes for one meeting.',
      'This is the meeting-level workspace rather than the overview of all check-ins.',
    ],
    links: [
      { href: '/one-on-ones', label: 'Back to 1:1 hub' },
      { href: '/performance', label: 'Open performance reviews' },
    ],
  },
  {
    id: 'org-locked-route',
    match: { kind: 'exact', path: '/org-locked' },
    title: 'What this org-locked route is for',
    summary:
      'This route exists to support locked-organisation handling in the main app shell. If workspace access is restricted because of billing or administration status, Campsite uses this state to stop normal work until access is restored.',
    highlights: [
      'This is a system route rather than a day-to-day workspace.',
      'In practice you will usually be redirected or shown a locked-state overlay instead of using this page directly.',
    ],
    links: [{ href: '/dashboard', label: 'Open dashboard' }],
  },
  {
    id: 'pending-membership',
    match: { kind: 'exact', path: '/pending' },
    title: 'What the pending access page is for',
    summary:
      'This page explains that your account setup or organisation access is not fully ready yet. It is used when a member still needs approval, profile creation, or another registration step before normal access can begin.',
    highlights: [
      'Use it as a status page during account setup rather than a normal workspace.',
      'It helps clarify why you cannot reach the rest of the app yet and what still needs to happen.',
    ],
  },
  {
    id: 'pending-approvals',
    match: { kind: 'exact', path: '/pending-approvals' },
    title: 'What the shared pending approvals page is for',
    summary:
      'This page is the approval queue for new member registrations. It helps authorised reviewers approve or reject people before they are allowed into the organisation workspace.',
    highlights: [
      'Use it when you are reviewing new join requests rather than ongoing member records.',
      'It is the general approval workspace, while admin has its own admin-focused view of the same process.',
    ],
    links: [
      { href: '/manager', label: 'Open manager overview' },
      { href: '/admin/pending', label: 'Open admin pending approvals' },
    ],
  },
  {
    id: 'performance-self',
    match: { kind: 'exact', path: '/performance' },
    title: 'What your performance reviews page is for',
    summary:
      'This page shows your performance reviews and, where permitted, reviews you need to complete for direct reports. It helps you move through self-assessments, manager reviews, and completed review history.',
    highlights: [
      'Use it for your personal or manager-assigned review work rather than organisation-wide cycle setup.',
      'It is the participant view of performance, not the HR admin control center.',
    ],
    links: [
      { href: '/one-on-ones', label: 'Open 1:1 hub' },
      { href: '/profile', label: 'Open profile' },
    ],
  },
  {
    id: 'performance-self-detail',
    match: { kind: 'template', path: '/performance/[reviewId]' },
    title: 'What this performance review detail page is for',
    summary:
      'This page is the detailed workspace for one performance review. It helps you complete, revisit, or understand the content and status of that specific review.',
    highlights: [
      'Use it when one review needs focused attention.',
      'This is the review-level workspace rather than the index of all your reviews.',
    ],
    links: [
      { href: '/performance', label: 'Back to performance reviews' },
      { href: '/one-on-ones', label: 'Open 1:1 hub' },
    ],
  },
  {
    id: 'profile',
    match: { kind: 'exact', path: '/profile' },
    title: 'What your profile is for',
    summary:
      'This page is your self-service profile and HR record workspace. It brings together personal details, employment information, documents, payroll-related forms, privacy actions, and other tabs tied to your own record.',
    highlights: [
      'Use it when you need your own HR and employment information rather than organisation-wide admin screens.',
      'Different tabs here cover different parts of your record, from personal details to documents and time-off context.',
    ],
    links: [
      { href: '/settings', label: 'Open settings' },
      { href: '/onboarding', label: 'Open onboarding' },
    ],
  },
  {
    id: 'profile-legacy-hr',
    match: { kind: 'exact', path: '/profile/hr' },
    title: 'What this legacy profile route is for',
    summary:
      'This route exists to keep older links to your HR record working. It now redirects to the main profile workspace, which is the current home for your self-service record.',
    highlights: [
      'Use the main profile page for current self-service record access.',
      'This route is a compatibility bridge rather than a separate workspace.',
    ],
    links: [
      { href: '/profile', label: 'Open profile' },
      { href: '/settings', label: 'Open settings' },
    ],
  },
  {
    id: 'reports',
    match: { kind: 'exact', path: '/reports' },
    title: 'What reports are for',
    summary:
      'This page is the reporting workspace for HR and Finance data. It helps authorised users build saved reports, run them on demand, inspect previews, and export or schedule the results.',
    highlights: [
      'Use it when you need structured analysis rather than browsing one operational page at a time.',
      'It combines report design, recent runs, previewing, and export workflow in one place.',
    ],
    links: [
      { href: '/hr', label: 'Open HR overview' },
      { href: '/finance', label: 'Open finance workspace' },
    ],
  },
  {
    id: 'resources',
    match: { kind: 'exact', path: '/resources' },
    title: 'What resources are for',
    summary:
      'This page is the internal resource library for your organisation. It helps members find documents, guides, and files, and for authorised users it also supports managing folders and archived content.',
    highlights: [
      'Use it when you need shared internal knowledge or downloadable files.',
      'Search and folder filters help narrow the library quickly when the resource set grows.',
    ],
    links: [
      { href: '/resources/new', label: 'Add a new resource' },
      { href: '/dashboard', label: 'Open dashboard' },
    ],
  },
  {
    id: 'resource-detail',
    match: { kind: 'template', path: '/resources/[id]' },
    title: 'What this resource detail page is for',
    summary:
      'This page shows one specific internal resource in detail. It helps members read the description, check file information, and access the exact document or asset they need.',
    highlights: [
      'Use it when one resource needs focused attention rather than browsing the library.',
      'This is the item-level view for a resource, not the index of every file.',
    ],
    links: [
      { href: '/resources', label: 'Back to resources' },
      { href: '/resources/new', label: 'Add a new resource' },
    ],
  },
  {
    id: 'resource-new',
    match: { kind: 'exact', path: '/resources/new' },
    title: 'What the new resource page is for',
    summary:
      'This page creates a new internal resource for the organisation library. It helps authorised users upload files, describe them clearly, and place them into the right folder for others to find later.',
    highlights: [
      'Use it when you are publishing a new guide, document, or shared file.',
      'Good folder placement and descriptions here make the wider resources library much easier to use.',
    ],
    links: [
      { href: '/resources', label: 'Back to resources' },
      { href: '/dashboard', label: 'Open dashboard' },
    ],
  },
  {
    id: 'rota',
    match: { kind: 'exact', path: '/rota' },
    title: 'What the rota is for',
    summary:
      'This page is your shift and rota workspace. It helps members see scheduled work, upcoming shifts, and staffing timing in the organisation calendar context.',
    highlights: [
      'Use it when you need to understand your working schedule rather than payroll output or attendance history.',
      'It pairs closely with attendance, leave, and calendar views.',
    ],
    links: [
      { href: '/attendance', label: 'Open attendance' },
      { href: '/calendar', label: 'Open calendar' },
    ],
  },
  {
    id: 'settings',
    match: { kind: 'exact', path: '/settings' },
    title: 'What personal settings are for',
    summary:
      'This page manages your personal Campsite preferences and connected services. It is where you update profile preferences, app behaviour, security-related options, and integrations such as calendar connections.',
    highlights: [
      'Use it when you are changing how Campsite works for you personally rather than for the whole organisation.',
      'This is also where integration connection feedback appears after linking external services.',
    ],
    links: [
      { href: '/profile', label: 'Open profile' },
      { href: '/dashboard', label: 'Open dashboard' },
    ],
  },
  {
    id: 'subscription-suspended',
    match: { kind: 'exact', path: '/subscription-suspended' },
    title: 'What this subscription status page is for',
    summary:
      'This page exists for subscription-status handling in the main app shell. If billing or subscription access is suspended, Campsite can use this state to explain why normal work is temporarily blocked.',
    highlights: [
      'This is a system status route rather than a normal workspace.',
      'In practice you will usually be redirected or shown a blocking state instead of working from this page directly.',
    ],
    links: [{ href: '/dashboard', label: 'Open dashboard' }],
  },
  {
    id: 'trial-ended',
    match: { kind: 'exact', path: '/trial-ended' },
    title: 'What this trial-ended route is for',
    summary:
      'This route supports the blocked state shown when an organisation trial has ended. Campsite uses it to stop normal work until billing or subscription activation has been completed.',
    highlights: [
      'This is a system status route rather than a day-to-day workspace.',
      'In practice you will usually be redirected or shown a trial-ended overlay instead of using this page directly.',
    ],
    links: [{ href: '/dashboard', label: 'Open dashboard' }],
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
  }

  for (const entry of PAGE_INFO_ENTRIES) {
    if (entry.match.kind === 'prefix' && (cleanPath === entry.match.path || cleanPath.startsWith(`${entry.match.path}/`))) {
      return entry;
    }
  }

  return null;
}
