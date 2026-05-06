'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  FileStack,
  Handshake,
  HeartPulse,
  IdCard,
  Landmark,
  Link,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface TimelineItem {
  id: number;
  title: string;
  date: string;
  content: string;
  category: string;
  iconKey:
    | 'user'
    | 'briefcase'
    | 'calendar'
    | 'users'
    | 'sparkles'
    | 'handshake'
    | 'file'
    | 'landmark'
    | 'shield'
    | 'heart'
    | 'idcard';
  relatedIds: number[];
  status: 'completed' | 'in-progress' | 'pending';
  energy: number;
}

interface RadialOrbitalTimelineProps {
  timelineData: TimelineItem[];
  showEnergy?: boolean;
  showConnectedNodes?: boolean;
  centerAvatarUrl?: string | null;
  centerAvatarAlt?: string;
  centerFallbackText?: string;
}

const timelineIconMap = {
  user: UserRound,
  briefcase: Briefcase,
  calendar: CalendarDays,
  users: UsersRound,
  sparkles: Sparkles,
  handshake: Handshake,
  file: FileStack,
  landmark: Landmark,
  shield: ShieldCheck,
  heart: HeartPulse,
  idcard: IdCard,
} as const;
const ORBIT_RADIUS_PX = 192; // Matches the visible 24rem orbit ring.

export default function RadialOrbitalTimeline({
  timelineData,
  showEnergy = true,
  showConnectedNodes = true,
  centerAvatarUrl = null,
  centerAvatarAlt = 'Profile avatar',
  centerFallbackText = '',
}: RadialOrbitalTimelineProps) {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [pulseEffect, setPulseEffect] = useState<Record<number, boolean>>({});
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandedItems({});
      setActiveNodeId(null);
      setPulseEffect({});
      setAutoRotate(true);
    }
  };

  const getRelatedItems = (itemId: number): number[] => {
    const currentItem = timelineData.find((item) => item.id === itemId);
    return currentItem ? currentItem.relatedIds : [];
  };

  const centerViewOnNode = (nodeId: number) => {
    if (!nodeRefs.current[nodeId]) return;
    const nodeIndex = timelineData.findIndex((item) => item.id === nodeId);
    const totalNodes = timelineData.length;
    const targetAngle = (nodeIndex / totalNodes) * 360;
    setRotationAngle(270 - targetAngle);
  };

  const toggleItem = (id: number) => {
    setExpandedItems((prev) => {
      const newState = { ...prev };
      Object.keys(newState).forEach((key) => {
        if (parseInt(key, 10) !== id) {
          newState[parseInt(key, 10)] = false;
        }
      });

      newState[id] = !prev[id];

      if (!prev[id]) {
        setActiveNodeId(id);
        setAutoRotate(false);
        const relatedItems = getRelatedItems(id);
        const newPulseEffect: Record<number, boolean> = {};
        relatedItems.forEach((relId) => {
          newPulseEffect[relId] = true;
        });
        setPulseEffect(newPulseEffect);
        centerViewOnNode(id);
      } else {
        setActiveNodeId(null);
        setAutoRotate(true);
        setPulseEffect({});
      }

      return newState;
    });
  };

  useEffect(() => {
    let rotationTimer: ReturnType<typeof setInterval> | null = null;
    if (autoRotate) {
      rotationTimer = setInterval(() => {
        setRotationAngle((prev) => Number(((prev + 0.2) % 360).toFixed(3)));
      }, 50);
    }
    return () => {
      if (rotationTimer !== null) clearInterval(rotationTimer);
    };
  }, [autoRotate]);

  const calculateNodePosition = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radius = ORBIT_RADIUS_PX;
    const radian = (angle * Math.PI) / 180;
    const x = Number((radius * Math.cos(radian)).toFixed(3));
    const y = Number((radius * Math.sin(radian)).toFixed(3));
    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = Number(
      Math.max(0.42, Math.min(1, 0.4 + 0.6 * ((1 + Math.sin(radian)) / 2))).toFixed(6)
    );
    return { x, y, zIndex, opacity };
  };

  const isRelatedToActive = (itemId: number): boolean => {
    if (!activeNodeId) return false;
    return getRelatedItems(activeNodeId).includes(itemId);
  };

  const getStatusStyles = (status: TimelineItem['status']): string => {
    switch (status) {
      case 'completed':
        return 'border-[var(--org-brand-primary,#0f6e56)] bg-[var(--org-brand-primary,#0f6e56)] text-[var(--org-brand-on-primary,#ffffff)]';
      case 'in-progress':
        return 'border-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_35%,var(--org-brand-border,#d8d8d8))] bg-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_12%,var(--org-brand-bg,#faf9f6))] text-[var(--org-brand-text,#121212)]';
      default:
        return 'border-[var(--org-brand-border,#d8d8d8)] bg-[color-mix(in_oklab,var(--org-brand-bg,#faf9f6)_92%,var(--org-brand-surface,#f5f4f1))] text-[var(--org-brand-muted,#6b6b6b)]';
    }
  };

  return (
    <div
      className="w-full overflow-visible"
      ref={containerRef}
      onClick={handleContainerClick}
    >
      <div className="relative flex h-[72vh] min-h-[520px] w-full items-center justify-center">
        <div
          className="absolute flex h-full w-full items-center justify-center"
          ref={orbitRef}
          style={{ perspective: '1000px' }}
        >
          <div className="absolute z-10 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full animate-pulse bg-[radial-gradient(circle_at_30%_30%,color-mix(in_srgb,var(--org-brand-primary,#0f6e56)_92%,white)_0%,var(--org-brand-primary,#0f6e56)_68%,color-mix(in_srgb,var(--org-brand-bg,#faf9f6)_65%,var(--org-brand-primary,#0f6e56))_100%)]">
            <div className="absolute h-20 w-20 animate-ping rounded-full border border-[color-mix(in_srgb,var(--org-brand-primary,#0f6e56)_35%,transparent)] opacity-70" />
            <div
              className="absolute h-24 w-24 animate-ping rounded-full border border-[color-mix(in_srgb,var(--org-brand-primary,#0f6e56)_20%,transparent)] opacity-50"
              style={{ animationDelay: '0.5s' }}
            />
            <div className="relative z-10 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full backdrop-blur-lg bg-[color-mix(in_srgb,var(--org-brand-bg,#faf9f6)_82%,white)] text-[10px] font-semibold text-[var(--org-brand-primary,#0f6e56)]">
              {centerAvatarUrl ? (
                <img src={centerAvatarUrl} alt={centerAvatarAlt} className="h-full w-full object-cover" />
              ) : (
                <span>{centerFallbackText}</span>
              )}
            </div>
          </div>

          <div className="absolute h-96 w-96 rounded-full border border-[color-mix(in_srgb,var(--org-brand-border,#d8d8d8)_45%,transparent)]" />

          {timelineData.map((item, index) => {
            const position = calculateNodePosition(index, timelineData.length);
            const isExpanded = expandedItems[item.id];
            const isRelated = isRelatedToActive(item.id);
            const isPulsing = pulseEffect[item.id];
            const Icon = timelineIconMap[item.iconKey] ?? UserRound;

            return (
              <div
                key={item.id}
                ref={(el) => {
                  nodeRefs.current[item.id] = el;
                }}
                className="absolute cursor-pointer transition-all duration-700"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: `translate(${position.x}px, ${position.y}px) translate(-50%, -50%)`,
                  zIndex: isExpanded ? 200 : position.zIndex,
                  opacity: isExpanded ? 1 : position.opacity,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItem(item.id);
                }}
              >
                <div
                  className={`absolute -inset-1 rounded-full ${isPulsing ? 'animate-pulse duration-1000' : ''}`}
                  style={{
                    background:
                      'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%)',
                    width: `${item.energy * 0.45 + 36}px`,
                    height: `${item.energy * 0.45 + 36}px`,
                    left: `-${(item.energy * 0.45 + 36 - 40) / 2}px`,
                    top: `-${(item.energy * 0.45 + 36 - 40) / 2}px`,
                  }}
                />

                <div
                  className={[
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 transform',
                    isExpanded
                      ? 'border-[var(--org-brand-primary,#0f6e56)] bg-[var(--org-brand-primary,#0f6e56)] text-[var(--org-brand-on-primary,#ffffff)] shadow-lg scale-150'
                      : isRelated
                        ? 'border-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_60%,var(--org-brand-border,#d8d8d8))] bg-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_22%,var(--org-brand-bg,#faf9f6))] text-[var(--org-brand-text,#121212)] animate-pulse'
                        : 'border-[var(--org-brand-border,#d8d8d8)] bg-[color-mix(in_oklab,var(--org-brand-surface,#f5f4f1)_88%,var(--org-brand-bg,#faf9f6))] text-[var(--org-brand-text,#121212)]',
                  ].join(' ')}
                >
                  <Icon size={16} />
                </div>

                <div
                  className={[
                    'absolute top-12 whitespace-nowrap text-xs font-semibold tracking-wider transition-all duration-300',
                    isExpanded ? 'scale-125 text-[var(--org-brand-text,#121212)]' : 'text-[color-mix(in_srgb,var(--org-brand-muted,#6b6b6b)_86%,transparent)]',
                  ].join(' ')}
                >
                  {item.title}
                </div>

                {isExpanded && (
                  <Card className="absolute top-20 left-1/2 w-72 -translate-x-1/2 overflow-visible border-[color-mix(in_oklab,var(--org-brand-border,#d8d8d8)_75%,transparent)] bg-[color-mix(in_srgb,var(--org-brand-bg,#faf9f6)_88%,transparent)] shadow-xl backdrop-blur-lg">
                    <div className="absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2 bg-[color-mix(in_srgb,var(--org-brand-border,#d8d8d8)_70%,transparent)]" />
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge className={`px-2 text-xs ${getStatusStyles(item.status)}`}>
                          {item.status === 'completed'
                            ? 'COMPLETE'
                            : item.status === 'in-progress'
                              ? 'IN PROGRESS'
                              : 'PENDING'}
                        </Badge>
                        <span className="text-xs font-mono text-[color-mix(in_srgb,var(--org-brand-muted,#6b6b6b)_88%,transparent)]">{item.date}</span>
                      </div>
                      <CardTitle className="mt-2 text-sm text-[var(--org-brand-text,#121212)]">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-[color-mix(in_srgb,var(--org-brand-text,#121212)_84%,var(--org-brand-muted,#6b6b6b))]">
                      <p>{item.content}</p>
                      {showEnergy ? (
                        <div className="mt-4 border-t border-[color-mix(in_srgb,var(--org-brand-border,#d8d8d8)_65%,transparent)] pt-3">
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="flex items-center">
                              <Zap size={10} className="mr-1" />
                              Energy Level
                            </span>
                            <span className="font-mono">{item.energy}%</span>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--org-brand-border,#d8d8d8)_60%,transparent)]">
                            <div
                              className="h-full bg-[linear-gradient(90deg,var(--org-brand-primary,#0f6e56)_0%,color-mix(in_srgb,var(--org-brand-primary,#0f6e56)_62%,var(--org-brand-secondary,#4f4f4f))_100%)]"
                              style={{ width: `${item.energy}%` }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {showConnectedNodes && item.relatedIds.length > 0 && (
                        <div className="mt-4 border-t border-[color-mix(in_srgb,var(--org-brand-border,#d8d8d8)_65%,transparent)] pt-3">
                          <div className="mb-2 flex items-center">
                            <Link size={10} className="mr-1 text-[var(--org-brand-muted,#6b6b6b)]" />
                            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--org-brand-muted,#6b6b6b)]">
                              Connected Nodes
                            </h4>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {item.relatedIds.map((relatedId) => {
                              const relatedItem = timelineData.find((i) => i.id === relatedId);
                              return (
                                <Button
                                  key={relatedId}
                                  variant="outline"
                                  size="sm"
                                  className="h-6 rounded-none border-[color-mix(in_srgb,var(--org-brand-border,#d8d8d8)_70%,transparent)] bg-transparent px-2 py-0 text-xs text-[var(--org-brand-muted,#6b6b6b)] transition-all hover:bg-[color-mix(in_srgb,var(--org-brand-primary,#0f6e56)_10%,transparent)] hover:text-[var(--org-brand-text,#121212)]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleItem(relatedId);
                                  }}
                                >
                                  {relatedItem?.title}
                                  <ArrowRight size={8} className="ml-1 text-[var(--org-brand-muted,#6b6b6b)]" />
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
