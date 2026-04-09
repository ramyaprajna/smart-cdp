import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { z } from 'zod';

// User schema for validation
export const userSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  role: z.enum(['admin', 'analyst', 'viewer', 'marketing']),
  isActive: z.boolean().default(true),
  passwordHash: z.string().min(6, 'Password must be at least 6 characters')
});

export type UserFormData = z.infer<typeof userSchema>;

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UsersResponse {
  users: User[];
  total: number;
  offset: number;
  limit: number;
}

export function useUserManagement() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch users
  const { data: usersData, isLoading, error } = useQuery<UsersResponse>({
    queryKey: ['/api/users'],
    staleTime: 2 * 60 * 1000, // 2 minutes cache
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: UserFormData) => {
      const response = await apiRequest('POST', '/api/users', userData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: 'Success',
        description: 'User created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create user',
        variant: 'destructive',
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, userData }: { id: string; userData: Partial<UserFormData> }) => {
      const response = await apiRequest('PUT', `/api/users/${id}`, userData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setSelectedUser(null);
      toast({
        title: 'Success',
        description: 'User updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update user',
        variant: 'destructive',
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('DELETE', `/api/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete user',
        variant: 'destructive',
      });
    },
  });

  // Resend activation email mutation
  const resendActivationMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest('POST', '/api/auth/resend-activation', { email });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: data.message || 'Activation email sent successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send activation email',
        variant: 'destructive',
      });
    },
  });

  // User management actions
  const createUser = useCallback((userData: UserFormData) => {
    createUserMutation.mutate(userData);
  }, [createUserMutation]);

  const updateUser = useCallback((id: string, userData: Partial<UserFormData>) => {
    updateUserMutation.mutate({ id, userData });
  }, [updateUserMutation]);

  const deleteUser = useCallback((userId: string) => {
    if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      deleteUserMutation.mutate(userId);
    }
  }, [deleteUserMutation]);

  const resendActivationEmail = useCallback((email: string) => {
    resendActivationMutation.mutate(email);
  }, [resendActivationMutation]);

  const selectUser = useCallback((user: User | null) => {
    setSelectedUser(user);
  }, []);

  return {
    // Data
    users: usersData?.users || [],
    totalUsers: usersData?.total || 0,
    selectedUser,

    // Loading states
    isLoading,
    isCreating: createUserMutation.isPending,
    isUpdating: updateUserMutation.isPending,
    isDeleting: deleteUserMutation.isPending,
    isResendingActivation: resendActivationMutation.isPending,

    // Error state
    error,

    // Actions
    createUser,
    updateUser,
    deleteUser,
    resendActivationEmail,
    selectUser,

    // Mutation objects for direct access if needed
    createUserMutation,
    updateUserMutation,
    deleteUserMutation,
    resendActivationMutation,
  };
}
