import { useState, useEffect } from 'react';
import './ChallengeCalendar.css';
import { api } from '../services/api';

interface ChallengeDay {
  id: number;
  date: string;
  completed: boolean;
  completionData?: {
    completedAt: string;
    decision: string;
    pointsEarned: number;
  } | null;
}

interface ChallengeCalendarProps {
  onSelectDate: (date: string) => void;
}

export default function ChallengeCalendar({ onSelectDate }: ChallengeCalendarProps) {
  const [challenges, setChallenges] = useState<ChallengeDay[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChallenges();
  }, [currentMonth]);

  const fetchChallenges = async () => {
    try {
      setLoading(true);
      const response = await api.getDailyChallengeHistory(1);
      setChallenges(response.challenges || []);
    } catch (error) {
      console.error('Error fetching challenges:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const getChallengeForDate = (year: number, month: number, day: number) => {
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return challenges.find(c => {
      const challengeDateStr = typeof c.date === 'string' ? c.date.split('T')[0] : c.date;
      return challengeDateStr === dateString;
    });
  };

  const isDateInFuture = (year: number, month: number, day: number) => {
    const date = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date > today;
  };

  const handleDateClick = (year: number, month: number, day: number) => {
    if (isDateInFuture(year, month, day)) return;
    
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelectDate(dateString);
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
    const today = new Date();
    if (nextMonth <= today) {
      setCurrentMonth(nextMonth);
    }
  };

  const canGoPrevious = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    // Don't allow going before December 2025
    return !(year === 2025 && month === 11); // month 11 is December
  };

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);
    const days = [];

    // Add empty cells for days before the month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const challenge = getChallengeForDate(year, month, day);
      const isFuture = isDateInFuture(year, month, day);
      const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
      const hasNoChallenge = !challenge && !isFuture;

      days.push(
        <div
          key={day}
          className={`calendar-day ${challenge?.completed ? 'completed' : challenge ? 'available' : ''} ${isFuture ? 'future' : ''} ${hasNoChallenge ? 'no-challenge' : ''} ${isToday ? 'today' : ''}`}
          onClick={() => !isFuture && challenge && handleDateClick(year, month, day)}
        >
          <div className="day-number">{day}</div>
          {challenge?.completed && (
            <div className="completion-badge">
              ✓
            </div>
          )}
          {challenge && !challenge.completed && !isFuture && (
            <div className="available-badge">
              •
            </div>
          )}
        </div>
      );
    }

    return days;
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const canGoNext = () => {
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
    const today = new Date();
    return nextMonth <= today;
  };

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <h3>Daily Challenge Calendar</h3>
      </div>

      <div className="calendar-navigation">
        <button 
          onClick={goToPreviousMonth} 
          className="nav-button"
          disabled={!canGoPrevious()}
        >
          ‹
        </button>
        <h4>
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h4>
        <button 
          onClick={goToNextMonth} 
          className="nav-button"
          disabled={!canGoNext()}
        >
          ›
        </button>
      </div>

      <div className="calendar-weekdays">
        <div>Sun</div>
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>
      </div>

      {loading ? (
        <div className="calendar-loading">Loading challenges...</div>
      ) : (
        <div className="calendar-grid">
          {renderCalendar()}
        </div>
      )}

      <div className="calendar-footer">
        <p>Click any past date to play that day's challenge</p>
      </div>
    </div>
  );
}
