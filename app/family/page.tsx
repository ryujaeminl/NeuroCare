'use client';

import { useState } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import ProtectedShell from '@/components/layout/ProtectedShell';
import { getFamily, getSharedPhotos } from '@/lib/family';
import { PhoneIcon, VideoIcon, HeartIcon, ShieldIcon, ChevronRightIcon, RobotIcon } from '@/components/icons';

export default function FamilyPage() {
  const [family] = useState(getFamily);
  const [photos] = useState(getSharedPhotos);
  const [callNotice, setCallNotice] = useState<string | null>(null);

  const startContact = (name: string, action: 'call' | 'video') => {
    setCallNotice(`${name}님에게 ${action === 'video' ? '영상통화' : '전화'}를 겁니다...`);
    setTimeout(() => setCallNotice(null), 2500);
  };

  return (
    <ProtectedShell>
    <div className="min-h-screen flex flex-col pb-24">
      <AppHeader />

      <main className="flex-1 px-5 pt-2 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-navy">사랑하는 가족들</h1>
          <p className="text-sm text-ink-muted mt-1">
            오늘도 가족들과 따뜻한 목소리를 나누어보세요. 새로운 사진들이 도착했습니다.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {family.map((member) => (
            <div key={member.id} className="bg-white rounded-2xl shadow-card p-4 flex flex-col items-center gap-3">
              <div className="relative">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold"
                  style={{ background: `linear-gradient(135deg, ${member.colorFrom}, ${member.colorTo})` }}
                >
                  {member.initial}
                </div>
                {member.badge && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-mint flex items-center justify-center border-2 border-white">
                    {member.badge === 'heart' ? (
                      <HeartIcon className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <ShieldIcon className="w-3.5 h-3.5 text-white" />
                    )}
                  </span>
                )}
              </div>
              <div className="text-center">
                <p className="font-bold text-navy">{member.name}</p>
                <p className="text-xs text-ink-muted">{member.relation}</p>
              </div>
              <button
                onClick={() => startContact(member.name, member.action)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-navy text-white text-xs font-semibold hover:bg-navy-light"
              >
                {member.action === 'video' ? (
                  <VideoIcon className="w-4 h-4" />
                ) : (
                  <PhoneIcon className="w-4 h-4" />
                )}
                {member.action === 'video' ? '영상통화' : '전화하기'}
              </button>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-navy">최근 공유된 사진</h2>
            <button className="flex items-center text-sm text-ink-muted">
              전체보기 <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-ink-muted mb-3">가족들이 보내온 소중한 일상을 확인하세요.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="bg-white rounded-2xl shadow-card overflow-hidden">
                <div
                  className="h-28 relative flex items-end p-3"
                  style={{ background: `linear-gradient(135deg, ${photo.colorFrom}, ${photo.colorTo})` }}
                >
                  <span className="text-xs font-medium text-white bg-black/25 px-2 py-1 rounded-full">
                    {photo.sharedBy}
                  </span>
                </div>
                <p className="text-xs text-ink-muted p-3 leading-relaxed">&quot;{photo.caption}&quot;</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full bg-mint-soft flex items-center justify-center shrink-0">
              <RobotIcon className="w-5 h-5 text-mint" />
            </span>
            <div>
              <p className="font-bold text-navy">Memoria 도우미</p>
              <p className="text-sm text-ink-muted">
                &quot;오랜만에 손자 민준이와 대화해보는 건 어떠세요? 최근 운동회에서 1등을 했다고 하네요!&quot;
              </p>
            </div>
          </div>
          <button
            onClick={() => startContact('민준', 'call')}
            className="shrink-0 px-4 py-2.5 rounded-full bg-navy text-white text-sm font-semibold hover:bg-navy-light"
          >
            민준이에게 전화 걸기
          </button>
        </div>
      </main>

      {callNotice && (
        <div className="fixed bottom-24 left-0 right-0 flex justify-center px-5 z-30">
          <div className="bg-navy text-white text-sm px-4 py-2.5 rounded-full shadow-soft">
            {callNotice}
          </div>
        </div>
      )}
    </div>
    </ProtectedShell>
  );
}
