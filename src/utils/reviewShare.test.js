import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn(() => {
  throw new Error('from() 호출됨 — 레거시 로더는 테이블 직접 select를 쓰면 안 됨');
});

vi.mock('../store/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

const { loadReviewPayload, loadLogPayload } = await import('./reviewShare');

describe('loadReviewPayload — get_legacy_link_payload RPC 전환', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockClear();
  });

  it('테이블 직접 select 대신 RPC를 id로 호출한다', async () => {
    rpcMock.mockResolvedValue({ data: { payload: { title: '대본' }, expires_at: '2099-01-01' }, error: null });
    const id = '11111111-1111-1111-1111-111111111111';
    const result = await loadReviewPayload(id);
    expect(rpcMock).toHaveBeenCalledWith('get_legacy_link_payload', { p_link_id: id });
    expect(fromMock).not.toHaveBeenCalled();
    expect(result).toEqual({ title: '대본' });
  });

  it('RPC 에러 LEGACY_LINK_NOT_FOUND → NOT_FOUND', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'LEGACY_LINK_NOT_FOUND' } });
    await expect(loadReviewPayload('x')).rejects.toThrow('NOT_FOUND');
  });

  it('RPC 에러 LEGACY_LINK_EXPIRED → EXPIRED', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'LEGACY_LINK_EXPIRED' } });
    await expect(loadReviewPayload('x')).rejects.toThrow('EXPIRED');
  });

  it('에러도 없고 data도 없으면 NOT_FOUND', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(loadReviewPayload('x')).rejects.toThrow('NOT_FOUND');
  });

  it('예상 밖 에러 메시지는 원본 메시지 그대로 전달', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'network down' } });
    await expect(loadReviewPayload('x')).rejects.toThrow('network down');
  });
});

describe('loadLogPayload — 동일 RPC 재사용', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockClear();
  });

  it('테이블 직접 select 대신 동일 RPC를 id로 호출한다', async () => {
    rpcMock.mockResolvedValue({ data: { payload: { logs: [] }, expires_at: null }, error: null });
    const id = '22222222-2222-2222-2222-222222222222';
    const result = await loadLogPayload(id);
    expect(rpcMock).toHaveBeenCalledWith('get_legacy_link_payload', { p_link_id: id });
    expect(fromMock).not.toHaveBeenCalled();
    expect(result).toEqual({ logs: [] });
  });

  it('RPC 에러 LEGACY_LINK_EXPIRED → EXPIRED', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'LEGACY_LINK_EXPIRED' } });
    await expect(loadLogPayload('x')).rejects.toThrow('EXPIRED');
  });

  it('RPC 에러 LEGACY_LINK_NOT_FOUND → NOT_FOUND', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'LEGACY_LINK_NOT_FOUND' } });
    await expect(loadLogPayload('x')).rejects.toThrow('NOT_FOUND');
  });
});
