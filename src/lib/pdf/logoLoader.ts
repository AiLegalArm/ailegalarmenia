import jsPDF from "jspdf";

let logoBase64Cache: string | null = null;

export async function loadLogoForPDF(): Promise<string | null> {
  if (logoBase64Cache) return logoBase64Cache;

  try {
    // Dynamic import of the logo asset
    const logoModule = await import('../../assets/logo.png');
    const logoUrl = logoModule.default;
    
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        logoBase64Cache = reader.result as string;
        resolve(logoBase64Cache);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Could not load logo for PDF:", e);
    return null;
  }
}

export function addLogoToPage(doc: jsPDF, logoData: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const logoWidth = 20;
  const logoHeight = 20;
  const x = (pageWidth - logoWidth) / 2;
  const y = 5;
  
  try {
    doc.addImage(logoData, 'PNG', x, y, logoWidth, logoHeight);
  } catch (e) {
    console.warn("Could not add logo to PDF:", e);
  }
}
