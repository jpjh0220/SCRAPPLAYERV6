import { useState, useRef } from 'react';
import { Image, Video, Send, X, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/lib/themeStore';

interface PostComposerProps {
  onPost: (post: any) => void;
}

export function PostComposer({ onPost }: PostComposerProps) {
  const { isAuthenticated } = useAuth();
  const { theme } = useThemeStore();
  const [content, setContent] = useState('');
  const [mediaType, setMediaType] = useState<'photo' | 'video' | null>(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (type: 'photo' | 'video') => {
    setMediaType(type);
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === 'photo' ? 'image/*' : 'video/*';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setMediaPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    setIsUploading(true);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          setMediaUrl(data.url);
          setUploadError(null);
        } else {
          setUploadError('Upload completed but no URL returned. Please try again.');
          setMediaPreview(null);
          setMediaType(null);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        setUploadError(errorData.error || 'Upload failed. Please try again.');
        setMediaPreview(null);
        setMediaType(null);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadError('Network error. Please check your connection and try again.');
      setMediaPreview(null);
      setMediaType(null);
    } finally {
      setIsUploading(false);
    }
  };

  const clearMedia = () => {
    setMediaType(null);
    setMediaUrl('');
    setMediaPreview(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !mediaUrl) return;
    
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim() || null,
          mediaType: mediaUrl ? mediaType : null,
          mediaUrl: mediaUrl || null,
        }),
      });

      if (res.ok) {
        const post = await res.json();
        onPost(post);
        setContent('');
        clearMedia();
      }
    } catch (error) {
      console.error('Failed to create post:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={`p-4 animate-scale-in rounded-xl shadow-sm ${theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'card-elevated'}`}>
        <p className={`text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          <a href="/api/login" className="text-rose-500 hover:text-rose-600 font-medium transition-colors">Sign in</a> to create posts
        </p>
      </div>
    );
  }

  return (
    <div className={`p-4 animate-slide-up rounded-xl shadow-sm ${theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'card-elevated'}`}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        data-testid="input-file-upload"
      />

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind?"
        className={`w-full bg-transparent resize-none focus:outline-none ${theme === 'dark' ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
        rows={3}
        data-testid="input-post-content"
      />

      {mediaPreview && (
        <div className="mt-3 relative">
          <button
            onClick={clearMedia}
            className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full hover:bg-black/80 transition-colors z-10"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          {isUploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
            </div>
          )}
          {mediaType === 'photo' ? (
            <img src={mediaPreview} alt="Preview" className="max-h-48 rounded-lg object-cover" />
          ) : mediaType === 'video' ? (
            <video src={mediaPreview} className="max-h-48 rounded-lg" controls />
          ) : null}
        </div>
      )}

      {uploadError && (
        <div className="mt-3 flex items-center gap-2 text-red-500 text-sm" data-testid="upload-error">
          <AlertCircle className="w-4 h-4" />
          <span>{uploadError}</span>
        </div>
      )}

      <div className={`flex items-center justify-between mt-3 pt-3 border-t ${theme === 'dark' ? 'border-white/10' : 'border-gray-100'}`}>
        <div className="flex gap-1">
          <button
            onClick={() => handleFileSelect('photo')}
            disabled={isUploading}
            className={`p-2 rounded-full transition-all disabled:opacity-50 ${
              mediaType === 'photo' 
                ? 'bg-rose-500/20 text-rose-500' 
                : theme === 'dark' 
                  ? 'text-gray-400 hover:bg-white/10 hover:text-gray-200' 
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
            data-testid="button-add-photo"
          >
            <Image className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleFileSelect('video')}
            disabled={isUploading}
            className={`p-2 rounded-full transition-all disabled:opacity-50 ${
              mediaType === 'video' 
                ? 'bg-rose-500/20 text-rose-500' 
                : theme === 'dark' 
                  ? 'text-gray-400 hover:bg-white/10 hover:text-gray-200' 
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
            data-testid="button-add-video"
          >
            <Video className="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || isUploading || (!content.trim() && !mediaUrl)}
          className="btn-primary px-5 py-2 text-white rounded-full font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          data-testid="button-post"
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4" />
              Post
            </>
          )}
        </button>
      </div>
    </div>
  );
}
