import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/auth/session_controller.dart';
import '../../shared/widgets/rb_components.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscure = true;
  bool _submitting = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailCtrl.text.trim();
    final pass = _passCtrl.text;
    if (email.isEmpty || pass.isEmpty) return;
    setState(() => _submitting = true);
    await ref
        .read(sessionControllerProvider.notifier)
        .login(email: email, password: pass);
    if (mounted) setState(() => _submitting = false);
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    final c = rbColors(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 64),
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: c.ink,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      'R',
                      style: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Routebook',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: c.ink,
                          height: 1.2,
                        ),
                      ),
                      Text(
                        'Sales · KiranaTech',
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          fontWeight: FontWeight.w400,
                          color: c.muted,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 40),
              Text(
                'Sign in to your account',
                style: GoogleFonts.inter(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: c.ink,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Enter your credentials to access the sales dashboard.',
                style: GoogleFonts.inter(fontSize: 14, color: c.muted),
              ),
              const SizedBox(height: 32),
              _FieldLabel(label: 'Email address', colors: c),
              const SizedBox(height: 6),
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                style: GoogleFonts.inter(fontSize: 15, color: c.ink),
                decoration: InputDecoration(
                  hintText: 'you@company.com',
                  hintStyle: GoogleFonts.inter(color: c.muted2, fontSize: 15),
                ),
              ),
              const SizedBox(height: 16),
              _FieldLabel(label: 'Password', colors: c),
              const SizedBox(height: 6),
              TextField(
                controller: _passCtrl,
                obscureText: _obscure,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
                style: GoogleFonts.inter(fontSize: 15, color: c.ink),
                decoration: InputDecoration(
                  hintText: '••••••••',
                  hintStyle: GoogleFonts.inter(color: c.muted2, fontSize: 15),
                  suffixIcon: GestureDetector(
                    onTap: () => setState(() => _obscure = !_obscure),
                    child: Icon(
                      _obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                      size: 18,
                      color: c.muted,
                    ),
                  ),
                ),
              ),
              if (session.errorMessage != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: isDark
                        ? RbColorsDark.dangerSoft
                        : RbColors.dangerSoft,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color: RbColors.danger.withOpacity(0.3), width: 0.5),
                  ),
                  child: Text(
                    session.errorMessage!,
                    style:
                        GoogleFonts.inter(fontSize: 13, color: RbColors.danger),
                  ),
                ),
              ],
              const SizedBox(height: 24),
              RbBtn(
                label: 'Sign in',
                variant: RbBtnVariant.primary,
                size: RbBtnSize.lg,
                loading: _submitting,
                onPressed: _submitting ? null : _submit,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: Divider(color: c.line, thickness: 0.5)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text('or',
                        style:
                            GoogleFonts.inter(fontSize: 13, color: c.muted)),
                  ),
                  Expanded(child: Divider(color: c.line, thickness: 0.5)),
                ],
              ),
              const SizedBox(height: 16),
              RbBtn(
                label: 'Sign in with SSO',
                variant: RbBtnVariant.outline,
                size: RbBtnSize.lg,
                onPressed: () {},
              ),
              const SizedBox(height: 48),
              Center(
                child: Text(
                  'v4.18.2 · build 22a · API IN-PROD',
                  style: GoogleFonts.jetBrainsMono(
                      fontSize: 11, color: c.muted2),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label, required this.colors});
  final String label;
  final RbThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: GoogleFonts.inter(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: colors.ink2,
      ),
    );
  }
}
