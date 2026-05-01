'use client';
import RadialOrbitalTimeline from '@/components/ui/radial-orbital-timeline';

const timelineData = [
  {
    id: 1,
    title: 'Planning',
    date: 'Jan 2024',
    content: 'Project planning and requirements gathering phase.',
    category: 'Planning',
    iconKey: 'calendar' as const,
    relatedIds: [2],
    status: 'completed' as const,
    energy: 100,
  },
  {
    id: 2,
    title: 'Design',
    date: 'Feb 2024',
    content: 'UI/UX design and system architecture.',
    category: 'Design',
    iconKey: 'file' as const,
    relatedIds: [1, 3],
    status: 'completed' as const,
    energy: 90,
  },
  {
    id: 3,
    title: 'Development',
    date: 'Mar 2024',
    content: 'Core features implementation and testing.',
    category: 'Development',
    iconKey: 'briefcase' as const,
    relatedIds: [2, 4],
    status: 'in-progress' as const,
    energy: 60,
  },
  {
    id: 4,
    title: 'Testing',
    date: 'Apr 2024',
    content: 'User testing and bug fixes.',
    category: 'Testing',
    iconKey: 'users' as const,
    relatedIds: [3, 5],
    status: 'pending' as const,
    energy: 30,
  },
  {
    id: 5,
    title: 'Release',
    date: 'May 2024',
    content: 'Final deployment and release.',
    category: 'Release',
    iconKey: 'sparkles' as const,
    relatedIds: [4],
    status: 'pending' as const,
    energy: 10,
  },
];

export function RadialOrbitalTimelineDemo() {
  return <RadialOrbitalTimeline timelineData={timelineData} />;
}
