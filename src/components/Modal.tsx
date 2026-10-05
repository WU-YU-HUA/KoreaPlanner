import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
}

export default function Modal({ title, onClose, children, wide = false }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog ref={dialogRef} className={`modal${wide ? ' modal-wide' : ''}`} onClose={onClose}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="關閉視窗" onClick={onClose}>×</button>
      </div>
      {children}
    </dialog>
  );
}