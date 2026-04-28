import React from "react";
import { LegalDocument } from "../../components/legal/LegalDocument";

const sections = [
  {
    title: "1. 수집하는 정보",
    body: (
      <ul>
        <li>회원가입 시 이름, 이메일 주소, 로그인 식별 정보</li>
        <li>사용자가 직접 입력하거나 업로드한 거래 내역, 이미지, 카테고리 정보</li>
        <li>서비스 안정성 확보를 위한 접속 기록, 오류 로그 등 최소 운영 정보</li>
      </ul>
    ),
  },
  {
    title: "2. 이용 목적",
    body: (
      <ul>
        <li>회원 식별, 로그인 유지, 계정 보호</li>
        <li>거래 데이터 저장, OCR 분석, 소비 통계 및 인사이트 제공</li>
        <li>오류 대응, 보안 모니터링, 기능 개선</li>
      </ul>
    ),
  },
  {
    title: "3. 보관 기간",
    body: (
      <p>
        개인정보와 사용자 데이터는 서비스 제공 기간 동안 보관되며, 회원 탈퇴 또는 삭제 요청이
        접수되면 법령상 별도 보관 의무가 있는 경우를 제외하고 합리적인 기간 내 삭제합니다.
      </p>
    ),
  },
  {
    title: "4. 제3자 제공 및 처리 위탁",
    body: (
      <p>
        서비스는 인증, 저장, 분석 기능 제공을 위해 클라우드 및 인증 인프라를 사용할 수 있으며,
        사용자의 데이터를 판매하지 않습니다. 법령상 요구가 있는 경우를 제외하고 사용자의 동의 없이
        제3자에게 제공하지 않습니다.
      </p>
    ),
  },
  {
    title: "5. 이용자의 권리",
    body: (
      <ul>
        <li>본인 정보 열람, 수정, 삭제 요청</li>
        <li>계정 탈퇴 및 서비스 이용 중단 요청</li>
        <li>잘못 수집되었거나 불필요한 정보에 대한 정정 요구</li>
      </ul>
    ),
  },
  {
    title: "6. 안전성 확보 조치",
    body: (
      <p>
        서비스는 접근 권한 관리, 인증 체계, 저장소 보안 설정 등 합리적인 보호 조치를 통해 사용자
        데이터를 안전하게 관리하려고 노력합니다.
      </p>
    ),
  },
] as const;

export const PrivacyPage: React.FC = () => (
  <LegalDocument
    badge="Privacy"
    title="개인정보 처리방침"
    summary="SpendTrack가 어떤 정보를 수집하고, 왜 사용하며, 얼마나 보관하는지 이해하기 쉽게 정리했습니다."
    effectiveDate="2026년 4월 28일"
    sections={sections}
  />
);
