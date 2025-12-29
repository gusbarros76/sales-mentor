export type SessionTokenPayload = {
  call_id: string;
  company_id: string;
  agent_id: string;
  iat?: number;
  exp?: number;
};
