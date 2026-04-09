/**
 * Quick Tips Demo Page
 *
 * Standalone page for demonstrating the Quick Tips system
 *
 * @created August 12, 2025
 */

import Header from "@/components/layout/header";
import { QuickTipsDemo } from "@/components/common/quick-tips-demo";

export default function QuickTipsDemoPage() {
  return (
    <>
      <Header
        title="Quick Tips System"
        subtitle="Interactive tooltip system for enhanced user guidance"
      />
      <div className="flex-1 overflow-y-auto">
        <QuickTipsDemo />
      </div>
    </>
  );
}
