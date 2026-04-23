/**
 * 역할: 모달 레이어를 통해 보조 입력 흐름을 처리하는 공통 컴포넌트입니다.
 * 위치: src\components\modal\ProductAddModal.tsx
 */
import { useState } from "react";
import styled from "styled-components";
import { Button } from "../primitives/Button";
import { FormField } from "../form/FormField";
import { TextInput } from "../form/TextInput";
import { AmountInput } from "../form/AmountInput";
import { Modal } from "./Modal";
import { parsePrice } from "../../utils/format";

export interface ProductAddPayload {
  name: string;
  price: number;
  link?: string;
}

export interface ProductInitialValues extends ProductAddPayload {
  id?: string;
}

interface ProductAddModalProps {
  isOpen: boolean;
  /**
   * 전달되면 수정 모드로 동작하고, 제목/버튼 라벨과 초기값이 함께 바뀝니다.
   */
  initialValues?: ProductInitialValues | null;
  onClose: () => void;
  onSubmit: (product: ProductAddPayload) => void;
}

const BodyStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

export const ProductAddModal = ({
  isOpen,
  initialValues,
  onClose,
  onSubmit,
}: ProductAddModalProps) => {
  const isEdit = Boolean(initialValues);
  const [name, setName] = useState(() => initialValues?.name ?? "");
  const [price, setPrice] = useState(() => (initialValues ? String(initialValues.price) : ""));
  const [link, setLink] = useState(() => initialValues?.link ?? "");

  const resetFields = () => {
    setName("");
    setPrice("");
    setLink("");
  };

  const handleClose = () => {
    resetFields();
    onClose();
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const parsedPrice = parsePrice(price);
    const trimmedLink = link.trim();

    if (!trimmedName || parsedPrice === 0) {
      return;
    }

    onSubmit({
      name: trimmedName,
      price: parsedPrice,
      link: trimmedLink || undefined,
    });

    resetFields();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? "상품 수정" : "상품 추가"}
    >
      <BodyStack>
        <FormField label="상품명" required>
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 에어팟 프로 1 로우"
          />
        </FormField>

        <FormField label="상품금액" required>
          {/* 내부 state price 는 기존과 동일한 raw digit 문자열. 표시만 콤마가 들어갑니다. */}
          <AmountInput
            value={price}
            onChange={(rawDigits) => setPrice(rawDigits)}
            placeholder="예: 129,000"
          />
        </FormField>

        <FormField
          label="상품 링크"
          helpText="링크는 추후에 추가하거나 수정할 수 있어요."
        >
          <TextInput
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="상품 URL을 입력하거나 비워두세요"
          />
        </FormField>

        <Button variant="primary" size="lg" fullWidth onClick={handleSubmit}>
          {isEdit ? "수정 저장하기" : "상품 추가하기"}
        </Button>
      </BodyStack>
    </Modal>
  );
};
