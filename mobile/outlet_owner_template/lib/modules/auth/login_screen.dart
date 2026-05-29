import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_typography.dart';
import 'package:outlet_owner_template/core/widgets/rb_button.dart';
import 'package:outlet_owner_template/core/widgets/rb_text_field.dart';
import 'package:outlet_owner_template/core/auth/session_controller.dart';

/// Full-page login screen for Routebook sales app.
/// ConsumerStatefulWidget with email/password input and error handling.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  late TextEditingController _emailController;
  late TextEditingController _passwordController;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController();
    _passwordController = TextEditingController();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      setState(() {
        _error = 'Please enter email and password';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    await ref.read(sessionControllerProvider.notifier).login(
          email: email,
          password: password,
        );

    if (mounted) {
      final session = ref.read(sessionControllerProvider);
      if (session.errorMessage != null) {
        setState(() {
          _error = session.errorMessage;
          _loading = false;
        });
      } else {
        // Session update and router redirect handled by app shell
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Scaffold(
      backgroundColor: cs.bg,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Top spacing
                SizedBox(height: MediaQuery.of(context).size.height * 0.1),

                // Logo / app name
                Text(
                  'Routebook',
                  style: AppTextStyles.h1(cs.ink),
                  textAlign: TextAlign.center,
                ),

                // Subtitle
                const SizedBox(height: 8),
                Text(
                  'Sign in to continue',
                  style: AppTextStyles.meta(cs.muted),
                  textAlign: TextAlign.center,
                ),

                // Spacing before form
                const SizedBox(height: 40),

                // Email field
                RbTextField(
                  controller: _emailController,
                  label: 'Email',
                  placeholder: 'your@email.com',
                  keyboardType: TextInputType.emailAddress,
                  enabled: !_loading,
                ),

                // Spacing between fields
                const SizedBox(height: 12),

                // Password field
                RbTextField(
                  controller: _passwordController,
                  label: 'Password',
                  placeholder: 'Enter your password',
                  obscureText: true,
                  enabled: !_loading,
                ),

                // Spacing before error / button
                const SizedBox(height: 20),

                // Error message
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      _error!,
                      style: AppTextStyles.body(cs.danger),
                      textAlign: TextAlign.center,
                    ),
                  ),

                // Sign in button
                RbButton(
                  label: 'Sign in',
                  fullWidth: true,
                  isLoading: _loading,
                  onPressed: _loading ? null : _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
