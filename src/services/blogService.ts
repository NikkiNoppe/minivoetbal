import {
  deleteApplicationSettingForSession,
  insertApplicationSettingForSession,
  listApplicationSettingsForSession,
  updateApplicationSettingForSession,
} from '@/services/core/applicationSettingsSessionFetch';
import { fetchPublicApplicationSettings } from '@/services/public/publicApplicationSettingsFetch';
import { isBlogPostPubliclyVisible } from '@/lib/blogVisibility';

export interface BlogPostData {
  id?: number;
  setting_category: string;
  setting_name: string;
  setting_value: {
    title: string;
    content: string;
    published: boolean;
    published_at?: string;
    visible_from?: string | null;
    visible_until?: string | null;
    imageUrl?: string | null;
  };
}

export interface BlogPost {
  id: number;
  setting_category: string;
  setting_name: string;
  setting_value: {
    title: string;
    content: string;
    published: boolean;
    published_at?: string;
    visible_from?: string | null;
    visible_until?: string | null;
    imageUrl?: string | null;
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return fallback;
}

const transformBlogPostData = (data: any[]): BlogPost[] => {
  return data.map(item => {
    const settingValue = typeof item.setting_value === 'string'
      ? JSON.parse(item.setting_value)
      : item.setting_value;

    return {
      id: item.id,
      setting_category: item.setting_category,
      setting_name: item.setting_name,
      setting_value: {
        title: settingValue?.title || '',
        content: settingValue?.content || '',
        published: settingValue?.published || false,
        published_at: settingValue?.published_at,
        visible_from: settingValue?.visible_from ?? null,
        visible_until: settingValue?.visible_until ?? null,
        imageUrl: settingValue?.imageUrl ?? null,
      },
    };
  });
};

function normalizeBlogSettingValue(
  settingValue: BlogPostData['setting_value'],
): BlogPostData['setting_value'] {
  const normalized = { ...settingValue };
  normalized.visible_from = normalized.visible_from?.trim() || null;
  normalized.visible_until = normalized.visible_until?.trim() || null;

  if (normalized.published && !normalized.published_at) {
    normalized.published_at = new Date().toISOString();
  }
  if (!normalized.published) {
    delete normalized.published_at;
  }

  return normalized;
}

export const blogService = {
  async getAllBlogPosts(): Promise<BlogPost[]> {
    try {
      const data = await listApplicationSettingsForSession('blog_posts');
      return transformBlogPostData(data || []);
    } catch (error) {
      console.error('Error loading blog posts:', error);
      throw new Error('Kon blog posts niet laden');
    }
  },

  async getPublishedBlogPosts(organizationId: number): Promise<BlogPost[]> {
    try {
      const rows = await fetchPublicApplicationSettings(['blog_posts'], organizationId);
      const sorted = [...rows].sort((a, b) => b.id - a.id);
      return transformBlogPostData(sorted).filter((post) =>
        isBlogPostPubliclyVisible(post.setting_value),
      );
    } catch (error) {
      console.error('Error loading published blog posts:', error);
      throw new Error('Kon gepubliceerde blog posts niet laden');
    }
  },

  async createBlogPost(blogPostData: Omit<BlogPostData, 'id'>): Promise<void> {
    try {
      const settingValue = normalizeBlogSettingValue({ ...blogPostData.setting_value });

      await insertApplicationSettingForSession({
        setting_category: 'blog_posts',
        setting_name: blogPostData.setting_name || `blog_post_${Date.now()}`,
        setting_value: settingValue,
      });
    } catch (error) {
      console.error('Error creating blog post:', error);
      throw new Error(getErrorMessage(error, 'Kon blog post niet aanmaken'));
    }
  },

  async updateBlogPost(id: number, blogPostData: Partial<BlogPostData>): Promise<void> {
    try {
      if (!blogPostData.setting_value) {
        throw new Error('Geen bloggegevens om bij te werken');
      }

      const settingValue = normalizeBlogSettingValue({ ...blogPostData.setting_value });

      await updateApplicationSettingForSession(id, {
        setting_value: settingValue,
        setting_category: 'blog_posts',
      });
    } catch (error) {
      console.error('Error updating blog post:', error);
      throw new Error(getErrorMessage(error, 'Kon blog post niet bijwerken'));
    }
  },

  async deleteBlogPost(id: number): Promise<void> {
    try {
      await deleteApplicationSettingForSession(id, 'blog_posts');
    } catch (error) {
      console.error('Error deleting blog post:', error);
      throw new Error(getErrorMessage(error, 'Kon blog post niet verwijderen'));
    }
  },

  async togglePublishedStatus(id: number, published: boolean): Promise<void> {
    try {
      const rows = await listApplicationSettingsForSession('blog_posts');
      const currentRow = rows.find((row) => row.id === id);
      if (!currentRow) {
        throw new Error('Blog post niet gevonden');
      }

      const currentValue =
        typeof currentRow.setting_value === 'string'
          ? JSON.parse(currentRow.setting_value)
          : currentRow.setting_value;

      const updatedValue = normalizeBlogSettingValue({
        ...currentValue,
        published,
        title: currentValue?.title || '',
        content: currentValue?.content || '',
      });

      await updateApplicationSettingForSession(id, {
        setting_value: updatedValue,
        setting_category: 'blog_posts',
      });
    } catch (error) {
      console.error('Error toggling published status:', error);
      throw new Error(getErrorMessage(error, 'Kon publicatiestatus niet wijzigen'));
    }
  },
};

export const fetchBlogPosts = blogService.getPublishedBlogPosts;
export const createBlogPost = blogService.createBlogPost;
export const updateBlogPost = blogService.updateBlogPost;
export const deleteBlogPost = blogService.deleteBlogPost;
