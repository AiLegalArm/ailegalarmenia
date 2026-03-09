import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface PdfExportButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export const PdfExportButton = ({ 
  onClick, 
  disabled = false, 
  variant = 'outline',
  size = 'sm',
  className = ''
}: PdfExportButtonProps) => {
  const { t } = useTranslation(['common']);
  
  return (
    <Button 
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      <Download className="mr-2 h-4 w-4" />
      {t('common:export_pdf', 'Արտահանել PDF-ով')}
    </Button>
  );
};
