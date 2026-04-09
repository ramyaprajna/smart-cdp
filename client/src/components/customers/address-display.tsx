/**
 * AddressDisplay Component - Structured address renderer for Customer Profile modals
 *
 * REPLACES: renderJsonTable function that caused character-by-character display bug
 * INTEGRATES: Advanced address parser to handle multiple data formats
 * PROVIDES: Progressive disclosure UI with structured breakdown and original data view
 *
 * Created: August 13, 2025
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Globe, Building2 } from "lucide-react";
import { parseAddress, formatAddressForDisplay, isValidAddress } from "@shared/address-parser";

interface AddressDisplayProps {
  address: any; // Raw address data from database
  title?: string;
  className?: string;
  showOriginal?: boolean;
}

export const AddressDisplay: React.FC<AddressDisplayProps> = ({
  address,
  title = "Current Address",
  className = "",
  showOriginal = false
}) => {
  if (!address) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">No address information available</p>
        </CardContent>
      </Card>
    );
  }

  // Parse the address data
  const parsedAddress = parseAddress(address, {
    preserveOriginal: true,
    defaultCountry: 'United States'
  });

  if (!parsedAddress || !isValidAddress(parsedAddress)) {
    // Fallback for unparseable addresses - show as plain text
    const addressText = typeof address === 'string' ? address : JSON.stringify(address);

    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {title}
            <Badge variant="outline" className="text-xs">Raw Data</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {addressText}
          </p>
          {showOriginal && (
            <details className="mt-4">
              <summary className="text-xs text-muted-foreground cursor-pointer">Show original data</summary>
              <pre className="text-xs mt-2 p-2 bg-muted rounded">
                {JSON.stringify(address, null, 2)}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    );
  }

  // Format the parsed address for display
  const displayLines = formatAddressForDisplay(parsedAddress);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          {title}
          <Badge variant="secondary" className="text-xs">Structured</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Address Display */}
        <div className="space-y-2">
          {displayLines.map((line, index) => (
            <div key={index} className="flex items-start gap-2">
              {index === 0 && <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
              {index === displayLines.length - 1 && parsedAddress.country && (
                <Globe className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              )}
              {index > 0 && index < displayLines.length - 1 && (
                <div className="w-4 flex-shrink-0" />
              )}
              <p className="text-sm">{line}</p>
            </div>
          ))}
        </div>

        {/* Additional Fields */}
        {parsedAddress.extraFields && Object.keys(parsedAddress.extraFields).length > 0 && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Additional Information</h4>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(parsedAddress.extraFields).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground capitalize">
                    {key.replace(/[_-]/g, ' ')}:
                  </span>
                  <span className="text-sm font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Structured Data Breakdown */}
        <details className="pt-4 border-t">
          <summary className="text-sm text-muted-foreground cursor-pointer mb-2">
            View structured data breakdown
          </summary>
          <div className="space-y-2 pl-4">
            {parsedAddress.street1 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Street 1:</span>
                <span className="text-xs font-mono">{parsedAddress.street1}</span>
              </div>
            )}
            {parsedAddress.street2 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Street 2:</span>
                <span className="text-xs font-mono">{parsedAddress.street2}</span>
              </div>
            )}
            {parsedAddress.city && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">City:</span>
                <span className="text-xs font-mono">{parsedAddress.city}</span>
              </div>
            )}
            {parsedAddress.state && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">State:</span>
                <span className="text-xs font-mono">{parsedAddress.state}</span>
              </div>
            )}
            {parsedAddress.postalCode && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Postal Code:</span>
                <span className="text-xs font-mono">{parsedAddress.postalCode}</span>
              </div>
            )}
            {parsedAddress.country && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Country:</span>
                <span className="text-xs font-mono">{parsedAddress.country}</span>
              </div>
            )}
          </div>
        </details>

        {/* Show Original Data if requested */}
        {showOriginal && parsedAddress.originalInput && (
          <details className="pt-4 border-t">
            <summary className="text-xs text-muted-foreground cursor-pointer">Show original input</summary>
            <pre className="text-xs mt-2 p-2 bg-muted rounded whitespace-pre-wrap">
              {parsedAddress.originalInput}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
};

export default AddressDisplay;
