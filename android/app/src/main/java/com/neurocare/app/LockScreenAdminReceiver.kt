package com.neurocare.app

import android.app.admin.DeviceAdminReceiver

/**
 * 대화가 끝나고 조용해지면 화면을 잠가 백그라운드 호출어 감시로 돌아가기 위한 기기 관리자
 * 수신자. 실제 동작(콜백 오버라이드)은 필요 없고, DevicePolicyManager.lockNow()를 쓰려면
 * "활성 관리자"로 등록만 되어 있으면 된다.
 */
class LockScreenAdminReceiver : DeviceAdminReceiver()
