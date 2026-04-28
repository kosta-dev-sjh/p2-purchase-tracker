/**
 * 역할: 입력 흐름에서 재사용하는 폼 관련 공통 컴포넌트입니다.
 * 위치: src\components\form\FormField.tsx
 */
import type { ReactNode } from "react";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";

interface FormFieldProps {
  /** 단순 문자열뿐 아니라 카운터/뱃지 등을 함께 보여주기 위해 ReactNode를 허용합니다. */
  label: ReactNode;
  required?: boolean;
  helpText?: string;
  errorText?: string;
  statusText?: string;
  children: ReactNode;
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  color: ${tokens.color.ink2};
  font-size: 12px;
  font-weight: 600;
`;

const Required = styled.span`
  color: ${tokens.color.neg};
`;

const HelpText = styled.span`
  color: ${tokens.color.ink4};
  font-size: ${tokens.type.caption.size};
  line-height: 1.45;
`;

const ErrorText = styled.span`
  color: ${tokens.color.neg};
  font-size: ${tokens.type.caption.size};
  line-height: 1.45;
  font-weight: 600;
`;

const StatusText = styled.span`
  color: ${tokens.color.pos};
  font-size: ${tokens.type.caption.size};
  line-height: 1.45;
  font-weight: 600;
`;

export const FormField = ({
  label,
  required,
  helpText,
  errorText,
  statusText,
  children,
}: FormFieldProps) => (
  <Wrapper>
    <Label>
      {label}
      {required && <Required> *</Required>}
    </Label>
    {children}
    {errorText ? (
      <ErrorText>{errorText}</ErrorText>
    ) : statusText ? (
      <StatusText>{statusText}</StatusText>
    ) : helpText ? (
      <HelpText>{helpText}</HelpText>
    ) : null}
  </Wrapper>
);
