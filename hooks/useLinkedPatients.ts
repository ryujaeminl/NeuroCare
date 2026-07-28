"use client";

import { useEffect, useState } from "react";

export interface LinkedPatient {
  id: string;
  name: string;
  lastSession: {
    startedAt: string;
    mood: { mood: string; summary: string } | null;
  } | null;
}

export const SELECTED_PATIENT_STORAGE_KEY = "neurocare:selectedPatientId";
const STORAGE_KEY = SELECTED_PATIENT_STORAGE_KEY;

/**
 * 보호자 화면 대부분(복약/가족/사진/설정/대시보드)이 "지금 보고 있는 환자"를 공유해야 해서
 * 여기 한 곳에 모았다. 선택은 세션스토리지에 남겨서 페이지를 옮겨도 유지된다.
 */
export function useLinkedPatients() {
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/guardian/patients");
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "환자 목록을 불러오지 못했습니다.");
          return;
        }
        const list: LinkedPatient[] = data.patients ?? [];
        setPatients(list);
        const stored = window.sessionStorage.getItem(STORAGE_KEY);
        const initial = list.find((p) => p.id === stored)?.id ?? list[0]?.id ?? null;
        setSelectedIdState(initial);
      } catch {
        if (!cancelled) setError("환자 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function setSelectedId(id: string) {
    setSelectedIdState(id);
    window.sessionStorage.setItem(STORAGE_KEY, id);
  }

  return { patients, selectedId, setSelectedId, loading, error };
}
