import type { JobScreeningQuestionPersist } from '@/app/(main)/admin/jobs/actions';
import type { ScreeningQuestionOption } from '@campsite/types';

export type ApplicationQuestionTemplate = {
  id: string;
  category: string;
  title: string;
  /** Optional; shown as tooltip on template chips. */
  description?: string;
  build: () => Omit<
    JobScreeningQuestionPersist,
    'id' | 'sortOrder' | 'isPageBreak' | 'scoringEnabled' | 'initiallyHidden' | 'locked'
  >;
};

function rid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function materializeApplicationQuestionTemplate(
  templateId: string,
  nextSortOrder: number,
): JobScreeningQuestionPersist | null {
  const t = APPLICATION_QUESTION_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return null;
  const base = t.build();
  const options =
    base.options?.map((o) => ({
      id: rid(),
      label: o.label,
    })) ?? null;
  return {
    id: rid(),
    sortOrder: nextSortOrder,
    questionType: base.questionType,
    prompt: base.prompt,
    helpText: base.helpText,
    required: base.required,
    isPageBreak: false,
    scoringEnabled: true,
    scoringScaleMax: 5,
    initiallyHidden: false,
    locked: false,
    maxLength: base.maxLength,
    options: base.questionType === 'single_choice' ? options : null,
  };
}

function opts(rows: { label: string }[]): ScreeningQuestionOption[] {
  return rows.map((r) => ({ id: rid(), label: r.label }));
}

/** Curated starters — edit prompts after inserting to match your role. */
export const APPLICATION_QUESTION_TEMPLATES: ApplicationQuestionTemplate[] = [
  {
    id: 'why-role',
    category: 'Motivation',
    title: 'Interest in this role',
    description: 'Open paragraph — common across postings.',
    build: () => ({
      questionType: 'paragraph',
      prompt: 'What draws you to this role and our organisation?',
      helpText: 'A few clear sentences is enough.',
      required: true,
      maxLength: 2000,
      options: null,
    }),
  },
  {
    id: 'relevant-exp',
    category: 'Experience',
    title: 'Relevant experience',
    description: 'Summarise background for this vacancy.',
    build: () => ({
      questionType: 'paragraph',
      prompt: 'Briefly describe experience most relevant to this position.',
      helpText: 'Include role titles, setting, and timeframes if helpful.',
      required: true,
      maxLength: 3000,
      options: null,
    }),
  },
  {
    id: 'notice-period',
    category: 'Logistics',
    title: 'Notice period',
    description: 'Typical hiring screen.',
    build: () => ({
      questionType: 'short_text',
      prompt: 'What is your current notice period?',
      helpText: 'e.g. 1 month, 2 weeks, immediate',
      required: true,
      maxLength: 120,
      options: null,
    }),
  },
  {
    id: 'start-date',
    category: 'Logistics',
    title: 'Earliest start date',
    build: () => ({
      questionType: 'short_text',
      prompt: 'When could you start if offered the role?',
      helpText: '',
      required: true,
      maxLength: 120,
      options: null,
    }),
  },
  {
    id: 'right-to-work',
    category: 'Eligibility',
    title: 'Right to work (yes / no)',
    build: () => ({
      questionType: 'yes_no',
      prompt: 'Do you have the right to work in the United Kingdom for this role?',
      helpText: 'We may ask for evidence at a later stage.',
      required: true,
      maxLength: null,
      options: null,
    }),
  },
  {
    id: 'qualification-held',
    category: 'Eligibility',
    title: 'Required qualification',
    build: () => ({
      questionType: 'yes_no',
      prompt: 'Do you hold the qualifications stated in the job advert?',
      helpText: '',
      required: true,
      maxLength: null,
      options: null,
    }),
  },
  {
    id: 'first-90-days',
    category: 'Role fit',
    title: 'First 90 days',
    build: () => ({
      questionType: 'paragraph',
      prompt: 'What would you aim to achieve in your first 90 days?',
      helpText: '',
      required: false,
      maxLength: 2000,
      options: null,
    }),
  },
  {
    id: 'working-style',
    category: 'Role fit',
    title: 'Preferred working style',
    build: () => ({
      questionType: 'single_choice',
      prompt: 'Which working style do you prefer?',
      helpText: '',
      required: true,
      maxLength: null,
      options: opts([
        { label: 'Mostly deep focus, async communication' },
        { label: 'Collaborative with frequent syncs' },
        { label: 'A mix depending on the task' },
        { label: 'Flexible to match the team' },
      ]),
    }),
  },
  {
    id: 'years-exp',
    category: 'Experience',
    title: 'Years of relevant experience',
    build: () => ({
      questionType: 'single_choice',
      prompt: 'How many years of relevant experience do you have?',
      helpText: 'Choose the closest match.',
      required: true,
      maxLength: null,
      options: opts([
        { label: 'Less than 1 year' },
        { label: '1–2 years' },
        { label: '3–5 years' },
        { label: '6+ years' },
      ]),
    }),
  },
  {
    id: 'safeguarding',
    category: 'Compliance',
    title: 'Safeguarding / disclosures (yes / no)',
    build: () => ({
      questionType: 'yes_no',
      prompt: 'Are you aware of any reason you may not be suitable to work with children or vulnerable adults?',
      helpText: 'Answering “Yes” does not automatically disqualify you; we may follow up confidentially.',
      required: true,
      maxLength: null,
      options: null,
    }),
  },
  {
    id: 'salary-expectation',
    category: 'Logistics',
    title: 'Salary expectation',
    build: () => ({
      questionType: 'short_text',
      prompt: 'What are your salary expectations for this role?',
      helpText: 'A range or annual figure is fine.',
      required: false,
      maxLength: 200,
      options: null,
    }),
  },
  {
    id: 'challenge-overcome',
    category: 'Behavioural',
    title: 'Challenge you overcame',
    build: () => ({
      questionType: 'paragraph',
      prompt: 'Describe a difficult situation at work and how you handled it.',
      helpText: 'Situation, your actions, and outcome.',
      required: false,
      maxLength: 2500,
      options: null,
    }),
  },
];

export const APPLICATION_QUESTION_TEMPLATE_CATEGORIES = Array.from(
  new Set(APPLICATION_QUESTION_TEMPLATES.map((t) => t.category)),
).sort();
