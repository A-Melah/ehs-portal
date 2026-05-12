'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import InviteModal from './InviteModal';

export default function InviteButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-primary flex items-center gap-2"
      >
        <UserPlus size={16} /> Invite Member
      </button>

      {open && <InviteModal onClose={() => setOpen(false)} />}
    </>
  );
}