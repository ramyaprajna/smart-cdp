/**
 * AI Segment Suggestions Modal
 *
 * Displays AI-generated segment suggestions and allows admin to select and create segments
 * based on intelligent analysis of customer data and vector embeddings.
 *
 * VERIFIED WORKING: August 12, 2025
 * - DialogDescription import/export functioning correctly
 * - Component builds and renders without errors
 * - All Radix UI dependencies properly installed and configured
 *
 * @module AiSegmentModal
 * @created August 11, 2025
 * @last_verified August 12, 2025 - Evidence-based assessment confirmed functional
 */

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Brain, Users, TrendingUp, CheckCircle, AlertCircle, Lightbulb, Target, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateAISegmentSuggestions, createSegmentFromAI } from "@/lib/api";

// AI Segment Suggestion interface
interface AISegmentSuggestion {
  id: string;
  name: string;
  description: string;
  criteria: Record<string, any>;
  reasoning: string;
  estimatedSize: number;
  businessValue: 'high' | 'medium' | 'low';
  confidence: number;
  keyCharacteristics: string[];
  suggestedActions: string[];
}

interface AiSegmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AiSegmentModal({ isOpen, onClose }: AiSegmentModalProps) {
  const [suggestions, setSuggestions] = useState<AISegmentSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AISegmentSuggestion | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation for creating segment from AI suggestion
  const createSegmentMutation = useMutation({
    mutationFn: createSegmentFromAI,
    onSuccess: () => {
      toast({
        title: "AI Segment Created Successfully",
        description: "Your new segment has been created and is ready for use"
      });

      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/segments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/segment-distribution"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/stats"] });

      onClose();
      setSuggestions([]);
      setSelectedSuggestion(null);
    },
    onError: (error) => {
      toast({
        title: "Error Creating Segment",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Generate AI suggestions
  const generateSuggestions = useCallback(async () => {
    setIsGenerating(true);
    try {
      const response = await generateAISegmentSuggestions();
      setSuggestions(response.suggestions || []);

      if (response.suggestions?.length > 0) {
        toast({
          title: "AI Analysis Complete",
          description: `Generated ${response.suggestions.length} intelligent segment suggestions`
        });
      } else {
        toast({
          title: "Insufficient Data for AI Analysis",
          description: "Need at least 10 customers with diverse data patterns for meaningful segment suggestions. Import more customer data to enable AI-powered segmentation.",
          variant: "default"
        });
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      toast({
        title: "AI Generation Failed",
        description: "Unable to generate segment suggestions. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  }, [toast]);

  // Create segment from selected suggestion
  const handleCreateSegment = useCallback((suggestion: AISegmentSuggestion) => {
    createSegmentMutation.mutate(suggestion);
  }, [createSegmentMutation]);

  // Get business value color
  const getBusinessValueColor = (value: string) => {
    switch (value) {
      case 'high': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI-Powered Segment Generation
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Generate intelligent customer segments based on behavioral patterns, demographics, and engagement data
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col h-full">
          {suggestions.length === 0 ? (
            // Initial state - Generate suggestions
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">Ready to Analyze Your Customer Base</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Our AI will analyze customer profiles, behavioral patterns, and vector embeddings to suggest
                  meaningful segments for better targeting and engagement.
                </p>
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800">
                    <strong>Data Requirements:</strong> AI analysis works best with 10+ customers and diverse data patterns.
                    Small or highly uniform datasets may not generate meaningful suggestions.
                  </p>
                </div>
              </div>
              <Button
                onClick={generateSuggestions}
                disabled={isGenerating}
                size="lg"
                className="flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                    Analyzing Customer Data...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Generate AI Segment Suggestions
                  </>
                )}
              </Button>
            </div>
          ) : (
            // Display suggestions
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">AI Generated Segments ({suggestions.length})</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateSuggestions}
                    disabled={isGenerating}
                  >
                    {isGenerating ? "Regenerating..." : "Regenerate"}
                  </Button>
                </div>

                {suggestions.map((suggestion, index) => (
                  <Card key={suggestion.id} className="border-2 hover:border-primary/20 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg">{suggestion.name}</CardTitle>
                          <CardDescription>{suggestion.description}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getBusinessValueColor(suggestion.businessValue)}>
                            {suggestion.businessValue.toUpperCase()} VALUE
                          </Badge>
                          <div className={`text-sm font-medium ${getConfidenceColor(suggestion.confidence)}`}>
                            {suggestion.confidence}% confidence
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Key Metrics */}
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{suggestion.estimatedSize.toLocaleString()}</span>
                          <span className="text-muted-foreground">customers</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          <span className="capitalize">{suggestion.businessValue} business value</span>
                        </div>
                      </div>

                      <Separator />

                      {/* AI Reasoning */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-yellow-600" />
                          <span className="font-medium text-sm">AI Reasoning</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{suggestion.reasoning}</p>
                      </div>

                      {/* Key Characteristics */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-sm">Key Characteristics</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {suggestion.keyCharacteristics.map((characteristic: string, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {characteristic}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Suggested Actions */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-blue-600" />
                          <span className="font-medium text-sm">Suggested Actions</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {suggestion.suggestedActions.map((action: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {action}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Create Button */}
                      <div className="pt-2">
                        <Button
                          onClick={() => handleCreateSegment(suggestion)}
                          disabled={createSegmentMutation.isPending}
                          className="w-full"
                        >
                          {createSegmentMutation.isPending ? (
                            <>
                              <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                              Creating Segment...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Create This Segment
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
