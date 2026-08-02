import { useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { getCachedState, getState } from '../../lib/api';
import type { AppState } from '../../lib/types';
import CoachLoading from '../../components/CoachLoading';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import CalendarBoard from './CalendarBoard';
import DayDetailModal from './DayDetailModal';
import BookingForm from './BookingForm';

interface Preset {
  date?: string;
  slot?: string;
}

export default function BookingPage() {
  const { data, loading, error, refresh } = usePolling<AppState>(getState, 60000, getCachedState());
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset | null>(null);

  if (loading && !data) return <CoachLoading />;
  if (error && !data)
    return <div className="rounded-xl bg-danger-soft p-4 text-sm text-danger-fg">데이터를 불러오지 못했어요: {error}</div>;
  if (!data) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">레슨 현황</h1>
          <p className="text-xs text-slate-500">날짜를 눌러 시간대별 현황을 확인하세요</p>
        </div>
        <Button onClick={() => setPreset({})}>+ 신청하기</Button>
      </div>

      <div className="min-h-0 flex-1">
        <CalendarBoard state={data} onPickDate={setDetailDate} />
      </div>

      <DayDetailModal
        date={detailDate}
        state={data}
        onClose={() => setDetailDate(null)}
        onBook={(date, slot) => {
          setDetailDate(null);
          setPreset({ date, slot });
        }}
      />

      <Modal open={!!preset} onClose={() => setPreset(null)} title="레슨 신청" size="md">
        {preset && (
          <BookingForm
            state={data}
            initialDate={preset.date}
            initialSlot={preset.slot}
            onSubmitted={() => {
              setPreset(null);
              refresh();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
