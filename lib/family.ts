import { loadFromStorage, saveToStorage } from './storage';

export type ContactAction = 'call' | 'video';
export type FamilyBadge = 'heart' | 'shield' | null;

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  action: ContactAction;
  badge: FamilyBadge;
  initial: string;
  colorFrom: string;
  colorTo: string;
}

export interface SharedPhoto {
  id: string;
  sharedBy: string;
  caption: string;
  colorFrom: string;
  colorTo: string;
}

const FAMILY_KEY = 'memoria_family';
const PHOTOS_KEY = 'memoria_photos';

function seedFamily(): FamilyMember[] {
  return [
    { id: 'jinsu', name: '김진수', relation: '아들', action: 'call', badge: 'heart', initial: '진', colorFrom: '#3B4C87', colorTo: '#1B2A55' },
    { id: 'jia', name: '이지아', relation: '딸', action: 'video', badge: 'shield', initial: '지', colorFrom: '#5C8A6B', colorTo: '#2F5D40' },
    { id: 'minjun', name: '김민준', relation: '손자', action: 'call', badge: null, initial: '민', colorFrom: '#C79B5E', colorTo: '#9C7238' },
    { id: 'soyeon', name: '박소연', relation: '며느리', action: 'call', badge: null, initial: '소', colorFrom: '#8067A8', colorTo: '#4E3D72' },
  ];
}

function seedPhotos(): SharedPhoto[] {
  return [
    { id: 'p1', sharedBy: '이지아님이 공유함', caption: '어제 다녀온 공원 산책이에요. 공기가 너무 맑았어요!', colorFrom: '#F4C68A', colorTo: '#7FA3C9' },
    { id: 'p2', sharedBy: '김진수님이 공유함', caption: '민준이 생일 파티 때 찍은 사진이에요. 할머니 보여드리래요.', colorFrom: '#F0A6A0', colorTo: '#E8C468' },
    { id: 'p3', sharedBy: '박소연님이 공유함', caption: '오늘 오후 낮잠 자는 초코 모습이에요. 너무 귀엽죠?', colorFrom: '#D9C4A3', colorTo: '#B99A73' },
  ];
}

export function getFamily(): FamilyMember[] {
  return loadFromStorage<FamilyMember[]>(FAMILY_KEY, seedFamily());
}

export function saveFamily(members: FamilyMember[]) {
  saveToStorage(FAMILY_KEY, members);
}

export function getSharedPhotos(): SharedPhoto[] {
  return loadFromStorage<SharedPhoto[]>(PHOTOS_KEY, seedPhotos());
}
