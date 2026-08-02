// 공통 드롭다운(오타 방지의 핵심). 회원/날짜/시간 선택 전부 이 컴포넌트로 통일.
// 네이티브 <select> 대신 커스텀 리스트박스 — 둥근 패널·호버·선택 표시로 앱 톤과 맞춤.
// 접근성: role="listbox" + 키보드(↑↓ Enter Esc Home End) 지원.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  hint?: string;
  size?: 'sm' | 'md';
}

const PANEL_MAX = 260;

export default function Dropdown({
  label,
  value,
  onChange,
  options,
  placeholder = '선택하세요',
  disabled,
  id,
  className = '',
  hint,
  size = 'md',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  /** 트리거 위치 — 패널을 body 로 포털해 fixed 로 띄운다(레이아웃을 밀지 않고 위에 덮임) */
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; left: number; width: number; up: boolean } | null>(
    null,
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const autoId = useId();
  const btnId = id ?? `dd-${autoId}`;
  const listId = `${btnId}-list`;

  const selected = options.find((o) => o.value === value);
  const isEmpty = options.length === 0;

  // 바깥 클릭으로 닫기 (패널은 포털이라 별도로 확인)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    // 스크롤/리사이즈 시에는 위치가 어긋나므로 닫는다
    const onReflow = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [open]);

  // 활성 항목이 보이도록 스크롤
  useEffect(() => {
    if (!open || activeIdx < 0) return;
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIdx]);

  function openList() {
    if (disabled || isEmpty) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      // 아래 공간이 부족하면 위로 펼침
      const up = below < PANEL_MAX && rect.top > below;
      setAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, up });
    }
    const cur = options.findIndex((o) => o.value === value);
    setActiveIdx(cur >= 0 ? cur : firstEnabled());
    setOpen(true);
  }

  function firstEnabled() {
    return options.findIndex((o) => !o.disabled);
  }

  function close(focusBtn = true) {
    setOpen(false);
    if (focusBtn) btnRef.current?.focus();
  }

  function pick(idx: number) {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    close();
  }

  /** 사용 가능한 다음/이전 항목으로 이동 */
  function move(dir: 1 | -1) {
    if (isEmpty) return;
    let i = activeIdx;
    for (let step = 0; step < options.length; step++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActiveIdx(i);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIdx(firstEnabled());
        break;
      case 'End':
        e.preventDefault();
        setActiveIdx(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        pick(activeIdx);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  }

  const trigger =
    size === 'sm' ? 'px-3 py-1.5 text-sm rounded-lg' : 'px-3.5 py-2.5 text-base rounded-xl';

  return (
    <div ref={rootRef} className={`relative w-full ${className}`} onKeyDown={onKeyDown}>
      {label && (
        <label htmlFor={btnId} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}

      <button
        ref={btnRef}
        id={btnId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled || isEmpty}
        onClick={() => (open ? close(false) : openList())}
        className={`flex w-full items-center justify-between gap-2 border bg-white text-left shadow-sm outline-none transition ${trigger} ${
          open ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-300 hover:border-slate-400'
        } focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:border-slate-300`}
      >
        <span className={`truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open &&
        anchor &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={btnId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            style={{
              position: 'fixed',
              left: anchor.left,
              width: anchor.width,
              maxHeight: PANEL_MAX,
              ...(anchor.up
                ? { bottom: window.innerHeight - anchor.top + 4 }
                : { top: anchor.bottom + 4 }),
            }}
            className="animate-dropdown z-[70] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-black/5"
          >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            const isActive = i === activeIdx;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                onMouseEnter={() => !o.disabled && setActiveIdx(i)}
                onClick={() => pick(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  o.disabled
                    ? 'cursor-not-allowed text-slate-300'
                    : isSelected
                      ? 'bg-brand-50 font-semibold text-brand-700'
                      : isActive
                        ? 'bg-slate-100 text-slate-800'
                        : 'text-slate-700'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {isSelected && (
                  <svg className="h-4 w-4 shrink-0 text-brand-600" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M5 10.5l3.5 3.5L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
              );
            })}
          </ul>,
          document.body,
        )}

      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
