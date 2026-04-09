/**
 * CSS Security Utilities - Prevent CSS Injection Attacks
 * 
 * Comprehensive sanitization for CSS values to prevent injection of malicious
 * code through dangerouslySetInnerHTML or other dynamic CSS generation.
 * 
 * @security CRITICAL - Prevents CSS injection, XSS via CSS expressions
 * @created September 23, 2025
 */

// Valid CSS color patterns (hex, rgb, rgba, hsl, hsla, named colors, CSS variables)
const CSS_COLOR_PATTERNS = [
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, // Hex colors
  /^rgb\(\s*(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\s*,\s*){2}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\s*\)$/i, // RGB - ReDoS safe
  /^rgba\(\s*(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\s*,\s*){3}(?:0|1|0\.\d{1,3})\s*\)$/i, // RGBA - ReDoS safe
  /^hsl\(\s*(?:360|3[0-5]\d|[12]?\d{1,2}|\d{1,2})\s*,\s*(?:100|[1-9]?\d)%\s*,\s*(?:100|[1-9]?\d)%\s*\)$/i, // HSL - ReDoS safe
  /^hsla\(\s*(?:360|3[0-5]\d|[12]?\d{1,2}|\d{1,2})\s*,\s*(?:100|[1-9]?\d)%\s*,\s*(?:100|[1-9]?\d)%\s*,\s*(?:0|1|0\.\d{1,3})\s*\)$/i, // HSLA - ReDoS safe
  /^var\(\s*--[a-zA-Z][a-zA-Z0-9_-]{0,50}\s*(?:,\s*[^)]{1,100})?\s*\)$/i, // CSS custom properties - ReDoS safe
  /^(?:transparent|currentcolor)$/i, // Special values
];

// CSS named colors (Web standard colors)
const VALID_CSS_NAMED_COLORS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
  'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
  'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
  'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
  'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo',
  'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
  'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta',
  'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
  'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
  'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
  'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
  'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
  'plum', 'powderblue', 'purple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon',
  'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue',
  'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
  'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
]);

// Dangerous CSS patterns that could lead to code execution
const DANGEROUS_CSS_PATTERNS = [
  /javascript:/gi,
  /vbscript:/gi,
  /expression\s*\(/gi,
  /url\s*\(/gi,
  /import\s*\(/gi,
  /binding\s*:/gi,
  /behavior\s*:/gi,
  /mozbinding\s*:/gi,
  /-moz-binding\s*:/gi,
  /data\s*:\s*text\/html/gi,
  /data\s*:\s*image\/svg\+xml/gi,
  /@[^;]*;/gi, // @ rules outside controlled context
  /\/\*|\*\//g, // CSS comments that could be used for injection
  /[<>]/g, // HTML characters
  /[{}]/g, // Braces outside controlled context
];

// CSS property name validation
const VALID_CSS_PROPERTY_PATTERN = /^--[a-zA-Z][a-zA-Z0-9_-]*$/;

export interface CSSSanitizationResult {
  sanitizedValue: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CSSSanitizationOptions {
  allowNamedColors?: boolean;
  allowCSSVariables?: boolean;
  maxLength?: number;
  strict?: boolean;
}

/**
 * Comprehensive CSS color value sanitization
 */
export function sanitizeCSSColorValue(
  value: string,
  options: CSSSanitizationOptions = {}
): CSSSanitizationResult {
  const {
    allowNamedColors = true,
    allowCSSVariables = true,
    maxLength = 100,
    strict = true
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];

  // Input validation
  if (!value || typeof value !== 'string') {
    errors.push('Invalid color value: must be a non-empty string');
    return { sanitizedValue: '#000000', isValid: false, errors, warnings };
  }

  // Length check
  if (value.length > maxLength) {
    errors.push(`Color value exceeds maximum length of ${maxLength} characters`);
    return { sanitizedValue: '#000000', isValid: false, errors, warnings };
  }

  // Trim and normalize
  const trimmedValue = value.trim().toLowerCase();

  // Check for dangerous patterns first
  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(trimmedValue)) {
      errors.push(`Dangerous CSS pattern detected: ${pattern.toString()}`);
      return { sanitizedValue: '#000000', isValid: false, errors, warnings };
    }
  }

  // Validate against allowed color patterns
  const isValidPattern = CSS_COLOR_PATTERNS.some(pattern => pattern.test(trimmedValue));
  const isValidNamedColor = allowNamedColors && VALID_CSS_NAMED_COLORS.has(trimmedValue);
  
  if (!isValidPattern && !isValidNamedColor) {
    errors.push(`Invalid CSS color format: ${value}`);
    if (strict) {
      return { sanitizedValue: '#000000', isValid: false, errors, warnings };
    } else {
      warnings.push(`Falling back to safe default color for: ${value}`);
      return { sanitizedValue: '#000000', isValid: false, errors, warnings };
    }
  }

  // Additional validation for CSS variables
  if (trimmedValue.startsWith('var(') && !allowCSSVariables) {
    errors.push('CSS variables are not allowed in this context');
    return { sanitizedValue: '#000000', isValid: false, errors, warnings };
  }

  // Return sanitized (original case preserved for hex colors)
  return {
    sanitizedValue: value.trim(),
    isValid: true,
    errors,
    warnings
  };
}

/**
 * Sanitize CSS property name (for CSS custom properties)
 */
export function sanitizeCSSPropertyName(name: string): CSSSanitizationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!name || typeof name !== 'string') {
    errors.push('Invalid property name: must be a non-empty string');
    return { sanitizedValue: '', isValid: false, errors, warnings };
  }

  const trimmedName = name.trim();

  // Validate custom property name format
  if (!VALID_CSS_PROPERTY_PATTERN.test(trimmedName)) {
    errors.push(`Invalid CSS custom property name: ${name}`);
    return { sanitizedValue: '', isValid: false, errors, warnings };
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(trimmedName)) {
      errors.push(`Dangerous pattern in property name: ${name}`);
      return { sanitizedValue: '', isValid: false, errors, warnings };
    }
  }

  return {
    sanitizedValue: trimmedName,
    isValid: true,
    errors,
    warnings
  };
}

/**
 * Generate safe CSS rule string with validation
 */
export function generateSafeCSSRule(
  property: string,
  value: string,
  options: CSSSanitizationOptions = {}
): string {
  const propertyResult = sanitizeCSSPropertyName(property);
  const valueResult = sanitizeCSSColorValue(value, options);

  if (!propertyResult.isValid || !valueResult.isValid) {
    // Log security violation in production
    console.warn('CSS Security Violation:', {
      property: property,
      value: value,
      propertyErrors: propertyResult.errors,
      valueErrors: valueResult.errors
    });
    
    // Return safe fallback
    return '';
  }

  return `  ${propertyResult.sanitizedValue}: ${valueResult.sanitizedValue};`;
}

/**
 * Validate and sanitize chart configuration colors
 */
export function sanitizeChartConfig(config: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, itemConfig] of Object.entries(config)) {
    if (!itemConfig || typeof itemConfig !== 'object') {
      continue;
    }

    const sanitizedConfig = { ...itemConfig };

    // Sanitize direct color property
    if (itemConfig.color) {
      const colorResult = sanitizeCSSColorValue(itemConfig.color, { strict: false });
      sanitizedConfig.color = colorResult.sanitizedValue;
      
      if (!colorResult.isValid) {
        console.warn(`Chart config color sanitized for key "${key}": ${itemConfig.color} -> ${colorResult.sanitizedValue}`);
      }
    }

    // Sanitize theme colors
    if (itemConfig.theme && typeof itemConfig.theme === 'object') {
      const sanitizedTheme: Record<string, string> = {};
      
      for (const [themeKey, themeColor] of Object.entries(itemConfig.theme)) {
        if (typeof themeColor === 'string') {
          const colorResult = sanitizeCSSColorValue(themeColor, { strict: false });
          sanitizedTheme[themeKey] = colorResult.sanitizedValue;
          
          if (!colorResult.isValid) {
            console.warn(`Chart theme color sanitized for "${key}.theme.${themeKey}": ${themeColor} -> ${colorResult.sanitizedValue}`);
          }
        }
      }
      
      sanitizedConfig.theme = sanitizedTheme;
    }

    sanitized[key] = sanitizedConfig;
  }

  return sanitized;
}

/**
 * Performance optimized color validation for hot paths
 */
export function isValidCSSColor(value: string): boolean {
  if (!value || typeof value !== 'string' || value.length > 100) {
    return false;
  }

  const trimmed = value.trim().toLowerCase();
  
  // Quick check for common patterns first
  if (trimmed.startsWith('#') && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(trimmed)) {
    return true;
  }

  if (VALID_CSS_NAMED_COLORS.has(trimmed)) {
    return true;
  }

  // Full pattern matching for complex colors
  return CSS_COLOR_PATTERNS.some(pattern => pattern.test(trimmed)) &&
         !DANGEROUS_CSS_PATTERNS.some(pattern => pattern.test(trimmed));
}

export default {
  sanitizeCSSColorValue,
  sanitizeCSSPropertyName,
  generateSafeCSSRule,
  sanitizeChartConfig,
  isValidCSSColor
};