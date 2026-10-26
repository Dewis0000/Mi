import { useGameStore } from '../../store';
import { translate } from '../../i18n';
import { Modal } from '../primitives/Modal';
import { Button } from '../primitives/Button';

export function AboutDataModal({ onClose }: { onClose: () => void }) {
  const locale = useGameStore((s) => s.locale);
  return (
    <Modal title={translate(locale, 'about.title')} onClose={onClose}>
      <p className="mb-6 text-sm leading-relaxed text-muted">{translate(locale, 'about.sources')}</p>
      <Button variant="secondary" onClick={onClose}>
        {translate(locale, 'common.close')}
      </Button>
    </Modal>
  );
}
