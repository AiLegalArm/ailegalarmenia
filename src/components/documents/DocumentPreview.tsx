import { ScrollArea } from "@/components/ui/scroll-area";

interface DocumentPreviewProps {
  content: string;
}

export function DocumentPreview({ content }: DocumentPreviewProps) {
  // Format content with proper line breaks and spacing
  const formattedContent = content
    .split('\n')
    .map((line, index) => {
      // Check if line is a header (all caps or starts with specific patterns)
      const isHeader = /^[А-ЯA-Z\s]{5,}$/.test(line.trim()) || 
                       /^(ЗАЯВЛЕНИЕ|ЖАЛОБА|ХОДАТАЙСТВО|ИСКОВОЕ|ОБРАЩЕНИЕ|ТРЕБОВАНИЕ)/.test(line.trim());
      
      // Check if line is a section header
      const isSectionHeader = /^\d+\./.test(line.trim()) || 
                              /^(I\.|II\.|III\.|IV\.|V\.)/.test(line.trim());

      if (isHeader) {
        return (
          <p key={index} className="text-center font-bold text-lg my-4">
            {line}
          </p>
        );
      }

      if (isSectionHeader) {
        return (
          <p key={index} className="font-semibold mt-4 mb-2">
            {line}
          </p>
        );
      }

      if (line.trim() === '') {
        return <br key={index} />;
      }

      return (
        <p key={index} className="mb-2 text-justify leading-relaxed">
          {line}
        </p>
      );
    });

  return (
    <ScrollArea className="h-[600px]">
      <div className="p-6 bg-white dark:bg-gray-900 rounded-lg border shadow-inner font-serif">
        <div className="max-w-[700px] mx-auto">
          {formattedContent}
        </div>
      </div>
    </ScrollArea>
  );
}
