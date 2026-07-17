"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatGermanDate } from "@/lib/date-format";
import styles from "./DateField.module.css";

type PopupPosition = { top: number; left: number };

type DateFieldProps = {
  value: string; // ISO YYYY-MM-DD
  onChange: (value: string) => void;
};

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const pad2 = (n: number) => String(n).padStart(2, "0");

const toIsoDate = (year: number, monthIndex: number, day: number) =>
  `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;

// Parses an ISO YYYY-MM-DD string as a local date (not UTC) so calendar day numbers line up
// with what the user picked, regardless of timezone.
const parseIsoDateLocal = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const isSameDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Monday-first day-of-week index: Date.getDay() is 0=Sunday..6=Saturday, so shifting by -1
// (mod 7) turns it into 0=Monday..6=Sunday.
const mondayFirstDayIndex = (date: Date) => (date.getDay() + 6) % 7;

const DateField = ({ value, onChange }: DateFieldProps) => {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? parseIsoDateLocal(value) : null;
  const today = new Date();

  const [viewYear, setViewYear] = useState(() => (selectedDate ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selectedDate ?? today).getMonth());

  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PopupPosition | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Popup now lives in a document.body portal, so "inside" means inside either the
      // trigger's container or the portaled popup -- checking containerRef alone would
      // make every click inside the popup register as an outside click.
      const insideTrigger = containerRef.current?.contains(target) ?? false;
      const insidePopup = popupRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePopup) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Position the portaled popup from the trigger's live coordinates, and keep it in sync
  // if an ancestor (e.g. the modal's scrollable DialogContent) scrolls while it's open.
  // useLayoutEffect (not useEffect) so the position is set before the browser paints --
  // otherwise the popup would flash at its stale/default position for one frame.
  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.bottom, left: rect.left });
    };

    updatePosition();

    // Capture phase: scroll events don't bubble, but they do capture, so this is how we
    // hear about scrolling on any ancestor scroll container, not just window scroll.
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const handleToggle = () => {
    if (!open) {
      // Reset the visible month to the selected (or today's) date each time it's reopened.
      const anchor = selectedDate ?? today;
      setViewYear(anchor.getFullYear());
      setViewMonth(anchor.getMonth());
    }
    setOpen((prev) => !prev);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    onChange(toIsoDate(viewYear, viewMonth, day));
    setOpen(false);
  };

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = mondayFirstDayIndex(firstOfMonth);

  const cells: Array<number | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthYearLabel = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(
    firstOfMonth,
  );

  return (
    <div className={styles.container} ref={containerRef}>
      <button type="button" className={styles.field} onClick={handleToggle}>
        {value ? formatGermanDate(value) : "Datum wählen"}
      </button>

      {open &&
        position &&
        createPortal(
          <div
            className={styles.popup}
            ref={popupRef}
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
          >
            <div className={styles.header}>
              <button
                type="button"
                className={styles.navButton}
                onClick={handlePrevMonth}
                aria-label="Previous month"
              >
                &#8249;
              </button>
              <span className={styles.monthLabel}>{monthYearLabel}</span>
              <button type="button" className={styles.navButton} onClick={handleNextMonth} aria-label="Next month">
                &#8250;
              </button>
            </div>

            <div className={styles.grid}>
              {WEEKDAY_LABELS.map((label) => (
                <span key={label} className={styles.weekday}>
                  {label}
                </span>
              ))}
              {cells.map((day, index) => {
                if (day === null) {
                  return <span key={`blank-${index}`} className={styles.dayBlank} />;
                }

                const cellDate = new Date(viewYear, viewMonth, day);
                const isToday = isSameDate(cellDate, today);
                const isSelected = selectedDate !== null && isSameDate(cellDate, selectedDate);

                return (
                  <button
                    key={day}
                    type="button"
                    className={[styles.day, isToday ? styles.dayToday : "", isSelected ? styles.daySelected : ""]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleSelectDay(day)}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default DateField;
