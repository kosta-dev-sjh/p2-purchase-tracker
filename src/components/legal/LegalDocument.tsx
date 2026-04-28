import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";

type LegalSection = {
  title: string;
  body: ReactNode;
};

interface LegalDocumentProps {
  badge: string;
  title: string;
  summary: string;
  effectiveDate: string;
  sections: readonly LegalSection[];
}

const Page = styled.main`
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(79, 70, 229, 0.08), transparent 30%),
    linear-gradient(180deg, #fbfcff 0%, ${tokens.color.bg} 100%);
  padding: 40px 16px 72px;
`;

const Shell = styled.div`
  width: min(860px, 100%);
  margin: 0 auto;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
  color: ${tokens.color.ink3};
  font-size: 13px;
`;

const BrandLink = styled(Link)`
  color: ${tokens.color.ink1};
  font-weight: 800;
  text-decoration: none;
`;

const Nav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const NavLink = styled(Link)`
  color: ${tokens.color.accentHover};
  font-weight: 600;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const Card = styled.section`
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid ${tokens.color.line};
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(11, 18, 32, 0.08);
  padding: clamp(24px, 5vw, 40px);
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: ${tokens.color.accentSubtle};
  color: ${tokens.color.accentActive};
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
`;

const Title = styled.h1`
  margin: 14px 0 10px;
  color: ${tokens.color.ink1};
  font-size: clamp(28px, 4vw, 38px);
  line-height: 1.12;
  letter-spacing: -0.03em;
`;

const Summary = styled.p`
  margin: 0;
  color: ${tokens.color.ink3};
  font-size: 15px;
  line-height: 1.75;
`;

const Meta = styled.div`
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid ${tokens.color.line2};
  color: ${tokens.color.ink4};
  font-size: 12.5px;
`;

const SectionList = styled.div`
  display: grid;
  gap: 18px;
  margin-top: 28px;
`;

const SectionCard = styled.article`
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line2};
  border-radius: 16px;
  padding: 20px 18px;
`;

const SectionTitle = styled.h2`
  margin: 0 0 10px;
  color: ${tokens.color.ink1};
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
`;

const Body = styled.div`
  color: ${tokens.color.ink3};
  font-size: 14px;
  line-height: 1.8;

  p {
    margin: 0;
  }

  ul {
    margin: 10px 0 0;
    padding-left: 18px;
  }

  li + li {
    margin-top: 6px;
  }
`;

export const LegalDocument = ({
  badge,
  title,
  summary,
  effectiveDate,
  sections,
}: LegalDocumentProps) => (
  <Page>
    <Shell>
      <TopBar>
        <BrandLink to="/">SpendTrack</BrandLink>
        <Nav aria-label="법률 문서 이동">
          <NavLink to="/register">회원가입</NavLink>
          <NavLink to="/terms">이용약관</NavLink>
          <NavLink to="/privacy">개인정보 처리방침</NavLink>
        </Nav>
      </TopBar>
      <Card>
        <Badge>{badge}</Badge>
        <Title>{title}</Title>
        <Summary>{summary}</Summary>
        <Meta>시행일: {effectiveDate}</Meta>
        <SectionList>
          {sections.map((section) => (
            <SectionCard key={section.title}>
              <SectionTitle>{section.title}</SectionTitle>
              <Body>{section.body}</Body>
            </SectionCard>
          ))}
        </SectionList>
      </Card>
    </Shell>
  </Page>
);
