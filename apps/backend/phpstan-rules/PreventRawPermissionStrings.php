<?php

declare(strict_types=1);

namespace App\Static;

use PhpParser\Node;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Scalar\String_;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\IdentifierRuleError;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;
use PHPStan\Type\VerbosityLevel;

/**
 * Forbids raw string arguments to Gate::allows / Gate::denies / etc.
 *
 * Any first argument must be a BackedEnum implementing
 * App\Authorization\Contracts\Permission, never a raw string. PHPStan
 * runs at compile time and rejects literal strings — runtime call sites
 * with enum->value are still accepted.
 *
 * @implements Rule<Node\Expr>
 */
class PreventRawPermissionStrings implements Rule
{
    /** @var list<string> */
    private const GATE_METHODS = ['allows', 'denies', 'check', 'authorize', 'forUser', 'any', 'none'];

    public function getNodeType(): string
    {
        return Node\Expr::class;
    }

    /**
     * @return list<IdentifierRuleError>
     */
    public function processNode(Node $node, Scope $scope): array
    {
        if (! ($node instanceof StaticCall) && ! ($node instanceof MethodCall)) {
            return [];
        }

        if (! $node->name instanceof Node\Identifier) {
            return [];
        }

        $methodName = $node->name->toString();
        if (! in_array($methodName, self::GATE_METHODS, true)) {
            return [];
        }

        if ($node instanceof StaticCall) {
            if (! $node->class instanceof Node\Name) {
                return [];
            }
            $calleeType = $node->class->toString();
        } else {
            $calleeType = $scope->getType($node->var)->describe(VerbosityLevel::value());
        }

        if (! str_contains($calleeType, 'Gate')) {
            return [];
        }

        if (! isset($node->args[0]) || ! $node->args[0] instanceof Node\Arg) {
            return [];
        }

        $arg = $node->args[0]->value;
        if ($arg instanceof String_) {
            return [
                RuleErrorBuilder::message(sprintf(
                    'Raw permission string "%s" passed to %s::%s — use a BackedEnum implementing App\\Authorization\\Contracts\\Permission instead.',
                    $arg->value,
                    $calleeType,
                    $methodName,
                ))->identifier('azimuth.rawPermissionString')->build(),
            ];
        }

        return [];
    }
}
