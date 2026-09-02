import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RoomList from './RoomList';

describe('RoomList private-room entry', () => {
  it('submits a six-digit invitation code with the nickname', () => {
    const onJoinByCode = vi.fn();

    render(
      <RoomList
        rooms={[]}
        loading={false}
        onRefresh={vi.fn()}
        onSelectRoom={vi.fn()}
        onJoinByCode={onJoinByCode}
      />,
    );

    fireEvent.change(screen.getByLabelText('초대 코드'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '참가자' } });
    fireEvent.click(screen.getByRole('button', { name: '코드로 입장' }));

    expect(onJoinByCode).toHaveBeenCalledWith('123456', { nickname: '참가자' });
  });
});
