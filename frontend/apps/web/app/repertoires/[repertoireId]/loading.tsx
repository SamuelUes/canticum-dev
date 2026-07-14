import { LoadingBubble } from '../../../src/components/ui/LoadingBubble';

export default function RepertoireLoading() {
  return <LoadingBubble isLoading={true} message="Cargando repertorio…" showDelay={0} />;
}
