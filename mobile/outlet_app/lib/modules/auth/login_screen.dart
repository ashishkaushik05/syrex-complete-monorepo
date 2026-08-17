import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/auth/session_controller.dart';
import '../../shared/widgets/app_button.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;

  static final _c = AppThemeColors(dark: false);

  Future<void> _submit() async {
    final email = _emailCtrl.text.trim();
    final pass = _passCtrl.text;
    if (email.isEmpty || pass.isEmpty) {
      setState(() => _error = 'Please enter your email and password.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(sessionControllerProvider.notifier).login(email, pass);
      // GoRouter redirect handles navigation when session state changes.
    } on DioException catch (e) {
      final isTimeout = e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout;
      setState(() => _error = isTimeout
          ? 'Request timed out. Please check your connection and try again.'
          : 'No internet connection. Please check your network and try again.');
    } catch (_) {
      setState(() => _error = 'Incorrect email or password. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _c.bg,
      body: Column(
        children: [
          // Top 35%: brand area
          Flexible(
            flex: 35,
            child: Container(
              width: double.infinity,
              color: _c.bg,
              child: SafeArea(
                bottom: false,
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 72, height: 72,
                        decoration: BoxDecoration(
                          color: _c.accent,
                          borderRadius: BorderRadius.circular(22),
                        ),
                        child: const Icon(Icons.store_outlined, size: 38, color: Colors.white),
                      ),
                      const SizedBox(height: 14),
                      Text('Syrex Outlet', style: AppTextStyles.headingXl(color: _c.text)),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Bottom 65%: login card
          Flexible(
            flex: 65,
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: _c.surface,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                boxShadow: [_c.shadowLg],
              ),
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(22, 28, 22, MediaQuery.of(context).padding.bottom + 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Welcome back', style: AppTextStyles.headingXl(color: _c.text)),
                    const SizedBox(height: 6),
                    Text('Sign in to your outlet account', style: AppTextStyles.bodyMed(color: _c.textMute)),
                    const SizedBox(height: 28),

                    // Email
                    _Label('Email address', c: _c),
                    const SizedBox(height: 8),
                    _Field(
                      controller: _emailCtrl,
                      hint: 'outlet@example.com',
                      keyboard: TextInputType.emailAddress,
                      c: _c,
                    ),
                    const SizedBox(height: 16),

                    // Password
                    _Label('Password', c: _c),
                    const SizedBox(height: 8),
                    _Field(
                      controller: _passCtrl,
                      hint: '••••••••',
                      obscure: _obscure,
                      c: _c,
                      suffix: IconButton(
                        icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                            size: 20, color: _c.textFaint),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                      onSubmitted: (_) => _submit(),
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: AppTextStyles.smallLabel(color: _c.red)),
                    ],

                    const SizedBox(height: 24),
                    AppButton(
                      label: 'Sign in',
                      onTap: _loading ? null : _submit,
                      loading: _loading,
                      fullWidth: true,
                      size: AppButtonSize.lg,
                      c: _c,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  final AppThemeColors c;
  const _Label(this.text, {required this.c});

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: AppTextStyles.smallLabelBold(color: c.textMute).copyWith(letterSpacing: 0.2),
  );
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final bool obscure;
  final TextInputType keyboard;
  final Widget? suffix;
  final ValueChanged<String>? onSubmitted;
  final AppThemeColors c;

  const _Field({
    required this.controller,
    required this.hint,
    this.obscure = false,
    this.keyboard = TextInputType.text,
    this.suffix,
    this.onSubmitted,
    required this.c,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.line),
        boxShadow: [c.shadow],
      ),
      child: TextField(
        controller: controller,
        obscureText: obscure,
        keyboardType: keyboard,
        autocorrect: false,
        onSubmitted: onSubmitted,
        style: AppTextStyles.bodyBold(color: c.text),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: AppTextStyles.bodyMed(color: c.textFaint),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          suffixIcon: suffix,
        ),
      ),
    );
  }
}
