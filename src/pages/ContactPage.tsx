import React, { useState } from 'react';
import { Mail, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { api } from '../services/api';

export const ContactPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('Licensing Inquiry');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await api.submitContact({ name, email, subject, message });
      setSuccess(true);
      setName('');
      setEmail('');
      setMessage('');
    } catch (err: any) {
      setError(err.message || 'Failed to deliver message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 min-h-[75vh]">
      <div className="text-center mb-8 space-y-2">
        <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
          Contact & Content Licensing
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
          For distribution rights, copyright inquiries, DMCA notices, or creative licensing partnerships,
          reach out to the Z1 Movies legal and editorial administration.
        </p>
      </div>

      <div className="bg-[#0e111a] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
        {success && (
          <div className="mb-6 p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-start gap-3 text-emerald-300 text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            <div>
              <div className="font-bold text-emerald-200">Message Delivered</div>
              <p className="text-xs text-emerald-300/90 mt-0.5">
                Thank you for contacting Z1 Movies. Our licensing and administration team will review your inquiry shortly.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-800/60 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@organization.com"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Subject / Department</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-red-500"
            >
              <option value="Licensing Inquiry">Content Licensing & Film Distribution</option>
              <option value="DMCA & Copyright">Copyright / DMCA Takedown Notice</option>
              <option value="Technical Playback">Video Player Technical Feedback</option>
              <option value="General Support">General Support & Inquiry</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Message</label>
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Provide complete details including license identifiers or content links if applicable..."
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors shadow-lg shadow-red-950/40 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Submit Inquiry</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
