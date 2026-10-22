import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  DRAG_SECTOR_SIZE,
  dragSectors,
  getDragAngle,
  getRatingForAngle,
  ratingOptions,
  type RatingOption,
} from "../ratings.ts";

const TINT_RADIUS = 24;
const COMMIT_DISTANCE = 90;
const FULL_TINT_DISTANCE = 160;
const MAX_TINT = 50;

const INTERACTIVE = "input, textarea, button, select, a";

class CardPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) =>
        !(
          nativeEvent.target instanceof Element &&
          nativeEvent.target.closest(INTERACTIVE)
        ) &&
        nativeEvent.isPrimary &&
        nativeEvent.button === 0,
    },
  ];
}

function getTarget(dx: number, dy: number) {
  const distance = Math.hypot(dx, dy);
  if (distance < TINT_RADIUS) return { option: undefined, distance };
  return { option: getRatingForAngle(getDragAngle(dx, dy)), distance };
}

interface DragState {
  id: string;
  dx: number;
  dy: number;
}

interface DragCardProps {
  id: string;
  clip?: "left" | "right";
  drag: DragState | null;
  children: ReactNode;
}

function DragCard({ id, clip, drag, children }: DragCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  const mine = drag?.id === id ? drag : null;
  const { option, distance } = mine
    ? getTarget(mine.dx, mine.dy)
    : { option: undefined, distance: 0 };
  const tint = option
    ? Math.min(MAX_TINT, (distance / FULL_TINT_DISTANCE) * MAX_TINT)
    : 0;

  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    ...(option
      ? ({
          "--drag-tint": option.color,
          "--drag-tint-amount": `${tint}%`,
        } as CSSProperties)
      : {}),
  };

  return (
    <div
      {...attributes}
      {...listeners}
      aria-describedby={undefined}
      className={`drag-card${clip ? ` drag-card-${clip}` : ""}${mine ? " is-dragging" : ""}${option ? " is-tinted" : ""}`}
      ref={setNodeRef}
      role={undefined}
      style={style}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}

function ArrowHints() {
  return (
    <div aria-hidden="true" className="drag-hints">
      {dragSectors.map(({ value, start }) => {
        const option = ratingOptions.find((o) => o.value === value) as
          RatingOption | undefined;
        if (!option) return null;
        const angle = start + DRAG_SECTOR_SIZE / 2;
        return (
          <span
            className="drag-hint"
            key={value}
            style={
              {
                "--angle": `${angle}deg`,
                "--hint-color": option.color,
              } as CSSProperties
            }
          >
            <span className="drag-hint-inner">
              <span className="drag-hint-arrow">↑</span>
              <span className="drag-hint-label">{option.label}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

interface DragRatingProps {
  roles: string[];
  onRate: (role: string, value: number) => void;
  renderCard: (editable: boolean) => ReactNode;
}

function DragRating({ roles, onRate, renderCard }: DragRatingProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const sensors = useSensors(
    useSensor(CardPointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const split = roles.length > 1;

  function handleMove({ active, delta }: DragMoveEvent) {
    setDrag({ id: String(active.id), dx: delta.x, dy: delta.y });
  }

  function handleEnd({ active, delta }: DragEndEvent) {
    setDrag(null);
    const { option, distance } = getTarget(delta.x, delta.y);
    const role = roles[Number(String(active.id).replace("role-", ""))];
    if (option && distance >= COMMIT_DISTANCE && role !== undefined) {
      onRate(role, option.value);
    }
  }

  return (
    <DndContext
      autoScroll={false}
      onDragCancel={() => setDrag(null)}
      onDragEnd={handleEnd}
      onDragMove={handleMove}
      sensors={sensors}
    >
      <div className={`drag-stage${drag ? " is-dragging" : ""}`}>
        {!split && (
          <DragCard drag={drag} id="role-0">
            {renderCard(true)}
          </DragCard>
        )}
        {split &&
          roles.map((role, index) => (
            <DragCard
              clip={index === 0 ? "left" : "right"}
              drag={drag}
              id={`role-${index}`}
              key={role}
            >
              {renderCard(index === 0)}
              <span className="drag-role-label">{role}</span>
            </DragCard>
          ))}
        <ArrowHints />
      </div>
    </DndContext>
  );
}

export default DragRating;
