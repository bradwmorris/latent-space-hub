"use client";

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface EventNode {
  id: number;
  title: string;
  node_type: string;
  event_date?: string;
  metadata?: {
    event_status?: string;
    event_type?: string;
    presenter_name?: string;
  };
}

interface EventsCalendarPaneProps {
  onNodeClick: (nodeId: number) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, daysInPrevMonth - i),
      isCurrentMonth: false,
    });
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({
      date: new Date(year, month, i),
      isCurrentMonth: true,
    });
  }

  // Next month padding (fill to 6 rows)
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({
      date: new Date(year, month + 1, i),
      isCurrentMonth: false,
    });
  }

  return days;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getEventColor(node: EventNode): string {
  const meta = node.metadata;
  if (meta?.event_status === 'cancelled') return 'var(--text-muted)';
  if (meta?.event_status === 'scheduled') return 'var(--success)';
  if (meta?.event_type === 'paper-club' || node.node_type === 'paper-club') return 'var(--accent-brand)';
  if (meta?.event_type === 'builders-club' || node.node_type === 'builders-club') return 'var(--warning)';
  return 'var(--text-muted)';
}

export default function EventsCalendarPane({ onNodeClick }: EventsCalendarPaneProps) {
  const [events, setEvents] = useState<EventNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [hoveredEvent, setHoveredEvent] = useState<number | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    setLoading(true);
    const types = ['event', 'paper-club', 'builders-club'];
    Promise.all(
      types.map(t =>
        fetch(`/api/nodes?type=${t}&limit=200&sortBy=event_date`)
          .then(res => res.json())
          .then(res => (res.success ? res.data : []))
      )
    )
      .then(results => setEvents(results.flat()))
      .catch(err => console.error('Failed to fetch events:', err))
      .finally(() => setLoading(false));
  }, []);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, EventNode[]> = {};
    for (const event of events) {
      if (!event.event_date) continue;
      const key = event.event_date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    }
    return map;
  }, [events]);

  // Count upcoming
  const today = new Date();
  const todayKey = formatDateKey(today);
  const upcomingCount = events.filter(e => {
    const d = e.event_date?.slice(0, 10);
    return d && d >= todayKey && e.metadata?.event_status !== 'cancelled';
  }).length;

  const calendarDays = getCalendarDays(year, month);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  if (loading) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '13px',
      }}>
        Loading events...
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Calendar header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px 12px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
            fontFamily: 'var(--font-mono)',
          }}>
            {MONTHS[month]} {year}
          </h2>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}>
            {upcomingCount} upcoming
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={prevMonth}
            style={{
              padding: '4px',
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={goToday}
            style={{
              padding: '4px 10px',
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            style={{
              padding: '4px',
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        {/* Day headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          {DAYS.map(day => (
            <div key={day} style={{
              padding: '8px 4px',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
            }}>
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridAutoRows: 'minmax(80px, 1fr)',
        }}>
          {calendarDays.map(({ date, isCurrentMonth }, idx) => {
            const dateKey = formatDateKey(date);
            const dayEvents = eventsByDate[dateKey] || [];
            const isToday = dateKey === todayKey;

            return (
              <div
                key={idx}
                style={{
                  padding: '4px',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--border-subtle)' : 'none',
                  background: isToday ? 'var(--accent-brand-subtle)' : 'transparent',
                  opacity: isCurrentMonth ? 1 : 0.35,
                }}
              >
                <div style={{
                  fontSize: '11px',
                  fontWeight: isToday ? 600 : 400,
                  color: isToday ? 'var(--accent-brand)' : 'var(--text-secondary)',
                  marginBottom: '2px',
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: 'right',
                  padding: '2px 4px',
                }}>
                  {date.getDate()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {dayEvents.slice(0, 3).map(event => {
                    const color = getEventColor(event);
                    const isCancelled = event.metadata?.event_status === 'cancelled';
                    const isHovered = hoveredEvent === event.id;
                    return (
                      <button
                        key={event.id}
                        onClick={() => onNodeClick(event.id)}
                        onMouseEnter={() => setHoveredEvent(event.id)}
                        onMouseLeave={() => setHoveredEvent(null)}
                        title={event.title}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '1px 4px',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          color: color,
                          background: isHovered ? 'var(--bg-elevated)' : 'transparent',
                          border: 'none',
                          borderLeft: `2px solid ${color}`,
                          borderRadius: '0 2px 2px 0',
                          cursor: 'pointer',
                          textAlign: 'left',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textDecoration: isCancelled ? 'line-through' : 'none',
                          transition: 'background 0.1s',
                          lineHeight: 1.4,
                        }}
                      >
                        {event.title.length > 20 ? event.title.slice(0, 18) + '...' : event.title}
                      </button>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span style={{
                      fontSize: '9px',
                      color: 'var(--text-muted)',
                      paddingLeft: '6px',
                    }}>
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
