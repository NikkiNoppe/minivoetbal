// Safety check for Array.isArray before any imports
if (typeof Array.isArray === 'undefined') {
  Array.isArray = function(arg: any): arg is any[] {
    return Object.prototype.toString.call(arg) === '[object Array]';
  };
}

// Safe Array.isArray check - no external imports
const isArray = (arg: any): arg is any[] => {
  if (typeof Array.isArray === 'function') {
    return Array.isArray(arg);
  }
  return Object.prototype.toString.call(arg) === '[object Array]';
};

// Safe Object.entries check - no external imports
const safeObjectEntries = (obj: any) => {
  if (typeof Object.entries === 'function') {
    return Object.entries(obj);
  }
  const ownProps = Object.keys(obj);
  let i = ownProps.length;
  const resArray = new Array(i);
  while (i--) {
    resArray[i] = [ownProps[i], obj[ownProps[i]]];
  }
  return resArray;
};

// Completely safe cn function that doesn't rely on external libraries
export function cn(...inputs: any[]) {
  try {
    // Filter out falsy values
    const validInputs = inputs.filter(input => {
      if (input === null || input === undefined || input === false) return false;
      if (typeof input === 'string' && input.trim() === '') return false;
      return true;
    });

    if (validInputs.length === 0) return '';

    // Process each input
    const processedInputs = validInputs.map(input => {
      if (typeof input === 'string') {
        return input.trim();
      }
      
      if (input && typeof input === 'object') {
        // Handle object inputs (like conditional classes)
        try {
          const entries = safeObjectEntries(input);
          return entries
            .filter(([_, value]) => Boolean(value))
            .map(([key]) => key)
            .join(' ');
        } catch (error) {
          console.warn('Error processing object input in cn:', error);
          return '';
        }
      }
      
      return '';
    });

    // Join all valid inputs
    return processedInputs
      .filter(input => input && input.trim() !== '')
      .join(' ')
      .trim();
  } catch (error) {
    console.warn('Error in cn function:', error);
    // Ultimate fallback - return empty string
    return '';
  }
}

/**
 * Normalizes venue names to a consistent short format for display
 * Examples:
 * - "Sporthal De Dageraad Harelbeke" → "Harelbeke - Dageraad"
 * - "De Vlasschaard Bavikhove" → "Bavikhove - Vlasschaard"
 * - "De Dageraad" → "Harelbeke - Dageraad"
 */
export function normalizeVenueName(venue: string | null | undefined): string {
  if (!venue) return 'Onbekend';
  
  const loc = venue.toLowerCase();
  
  // Dageraad / Harelbeke variations
  if (loc.includes('dageraad') || loc.includes('harelbeke')) {
    return 'Harelbeke - Dageraad';
  }
  
  // Vlasschaard / Bavikhove variations
  if (loc.includes('vlasschaard') || loc.includes('bavikhove')) {
    return 'Bavikhove - Vlasschaard';
  }
  
  // Fallback: return original or cleaned version
  return venue.replace(/^Sporthal\s+/i, '').trim();
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
}
