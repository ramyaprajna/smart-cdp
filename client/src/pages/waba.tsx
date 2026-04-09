import { useState, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, RefreshCw, Send, FileText, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

interface WabaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  components?: any[];
  lastSyncedAt?: string;
}

export default memo(function Waba() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [textForm, setTextForm] = useState({ to: "", text: "" });
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [templateForm, setTemplateForm] = useState({ to: "", templateName: "", languageCode: "en" });

  const { data: templatesData, isLoading: templatesLoading } = useQuery<{ templates: WabaTemplate[]; total: number }>({
    queryKey: ["/api/waba/templates"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/waba/templates/sync", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/waba/templates"] });
      toast({ title: "Templates synced", description: `${data.total} templates loaded` });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const sendTextMutation = useMutation({
    mutationFn: async (data: typeof textForm) => {
      const res = await apiRequest("POST", "/api/waba/send/text", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Text message sent" });
      setTextForm({ to: "", text: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send message", description: err.message, variant: "destructive" });
    },
  });

  const sendTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateForm) => {
      const res = await apiRequest("POST", "/api/waba/send/template", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Template message sent" });
      setTemplateForm({ to: "", templateName: "", languageCode: "en" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send template", description: err.message, variant: "destructive" });
    },
  });

  const templates = templatesData?.templates ?? [];

  return (
    <div className="flex-1 overflow-auto">
      <Header title="WABA Management" subtitle="WhatsApp Business API templates and messaging" />

      <div className="p-6 space-y-6">
        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates">
              <FileText className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="send">
              <Send className="h-4 w-4 mr-2" />
              Test Send
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Cached WhatsApp Templates</h3>
              <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending || !isAdmin} variant="outline" title={!isAdmin ? "Admin only" : undefined}>
                {syncMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sync Templates
              </Button>
            </div>

            {templatesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading templates...</span>
              </div>
            ) : templates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No templates cached</h3>
                  <p className="text-muted-foreground mb-4">
                    Click "Sync Templates" to fetch templates from your WABA account.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {templates.map((template) => (
                  <Card key={template.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{template.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline">{template.language}</Badge>
                            <Badge variant={template.status === "APPROVED" ? "default" : "secondary"}>
                              {template.status}
                            </Badge>
                            {template.category && <Badge variant="outline">{template.category}</Badge>}
                          </div>
                        </div>
                        {template.lastSyncedAt && (
                          <span className="text-xs text-muted-foreground">
                            Synced: {new Date(template.lastSyncedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="send" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Send Text Message</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Recipient Phone Number</Label>
                  <Input
                    value={textForm.to}
                    onChange={(e) => setTextForm({ ...textForm, to: e.target.value })}
                    placeholder="e.g. 60123456789"
                  />
                </div>
                <div>
                  <Label>Message</Label>
                  <Input
                    value={textForm.text}
                    onChange={(e) => setTextForm({ ...textForm, text: e.target.value })}
                    placeholder="Type your message"
                  />
                </div>
                <Button
                  onClick={() => sendTextMutation.mutate(textForm)}
                  disabled={sendTextMutation.isPending || !textForm.to || !textForm.text}
                >
                  {sendTextMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Send className="h-4 w-4 mr-2" />
                  Send Text
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Send Template Message</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Recipient Phone Number</Label>
                  <Input
                    value={templateForm.to}
                    onChange={(e) => setTemplateForm({ ...templateForm, to: e.target.value })}
                    placeholder="e.g. 60123456789"
                  />
                </div>
                <div>
                  <Label>Template Name</Label>
                  <Input
                    value={templateForm.templateName}
                    onChange={(e) => setTemplateForm({ ...templateForm, templateName: e.target.value })}
                    placeholder="Template name from WABA account"
                  />
                </div>
                <div>
                  <Label>Language Code</Label>
                  <Input
                    value={templateForm.languageCode}
                    onChange={(e) => setTemplateForm({ ...templateForm, languageCode: e.target.value })}
                    placeholder="en"
                  />
                </div>
                <Button
                  onClick={() => sendTemplateMutation.mutate(templateForm)}
                  disabled={sendTemplateMutation.isPending || !templateForm.to || !templateForm.templateName}
                >
                  {sendTemplateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Send className="h-4 w-4 mr-2" />
                  Send Template
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
});
